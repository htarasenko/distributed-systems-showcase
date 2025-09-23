import { Kafka, Producer, Consumer } from 'kafkajs';
import config from '../config';
import logger from '../utils/logger';
import { BetEventMessage } from '../types';
import {
  kafkaMessagesProduced,
  kafkaBatchLatency,
  kafkaCompressionRatio
} from './metrics';

// Kafka configuration
const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: config.kafka.retry
});

export const producer: Producer = kafka.producer({
  // Additional producer optimizations
  maxInFlightRequests: 5,  // Allow up to 5 in-flight requests
  idempotent: true,        // Ensure exactly-once delivery
  transactionTimeout: 30000 // 30 second transaction timeout
});
export const consumer: Consumer = kafka.consumer({ groupId: 'bet-events-consumer' });

// Producer connection management
let isProducerConnected = false;

// Manual batching for better throughput
interface PendingMessage {
  topic: string;
  messages: Array<{ key: string; value: string }>;
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const messageQueue: PendingMessage[] = [];
const BATCH_SIZE = 100;
const BATCH_LINGER_MS = 10;
let batchTimer: NodeJS.Timeout | null = null;

export async function connectProducer(): Promise<void> {
  if (!isProducerConnected) {
    logger.info('Connecting to Kafka producer...');
    await producer.connect();
    isProducerConnected = true;
    logger.info('Kafka producer connected successfully');
  }
}

export async function disconnectProducer(): Promise<void> {
  if (isProducerConnected) {
    // Process any remaining messages in the queue
    await processBatch();
    await producer.disconnect();
    isProducerConnected = false;
    logger.info('Kafka producer disconnected');
  }
}

// Process batched messages
async function processBatch(): Promise<void> {
  if (messageQueue.length === 0) return;

  const batch = messageQueue.splice(0, BATCH_SIZE);
  const batchStartTime = Date.now();

  try {
    await connectProducer();

    // Group messages by topic
    const messagesByTopic = new Map<string, Array<{ key: string; value: string }>>();

    for (const pendingMessage of batch) {
      if (!messagesByTopic.has(pendingMessage.topic)) {
        messagesByTopic.set(pendingMessage.topic, []);
      }
      messagesByTopic.get(pendingMessage.topic)!.push(...pendingMessage.messages);
    }

    // Send all messages for each topic
    const sendPromises = Array.from(messagesByTopic.entries()).map(async ([topic, messages]) => {
      return producer.send({
        topic,
        messages
      });
    });

    await Promise.all(sendPromises);

    // Record metrics
    const batchLatency = (Date.now() - batchStartTime) / 1000;
    kafkaBatchLatency.observe(batchLatency);
    kafkaMessagesProduced.inc({ topic: 'bet-events' }, messagesByTopic.get('bet-events')?.length || 0);

    // Resolve all pending promises
    batch.forEach(pendingMessage => pendingMessage.resolve());

    logger.info('Kafka batch processed successfully', {
      batchSize: batch.length,
      batchLatency: `${batchLatency.toFixed(3)}s`,
      topics: Array.from(messagesByTopic.keys())
    });

  } catch (error) {
    logger.error('Kafka batch processing failed:', error);
    // Reject all pending promises
    batch.forEach(pendingMessage => pendingMessage.reject(error as Error));
    isProducerConnected = false;
  }
}

// Schedule batch processing
function scheduleBatch(): void {
  if (batchTimer) return;

  batchTimer = setTimeout(async () => {
    batchTimer = null;
    await processBatch();
  }, BATCH_LINGER_MS);
}

// Kafka message publishing with batching metrics
export async function publishBetEvent(
  betId: string,
  userId: string,
  amount: number,
  gameId: string,
  betType: 'win' | 'lose' | 'draw' | 'over' | 'under' | 'exact_score' | 'total_goals' | 'first_goal' | 'last_goal',
  betValue: string | undefined,
  odds: number,
  potentialWin: number,
  transactionId: string,
  newBalance: number
): Promise<void> {

  try {
    await connectProducer();

    // Create a clean message object
    const kafkaMessage: Record<string, any> = {
      betId: String(betId),
      userId: String(userId),
      amount: Number(amount),
      gameId: String(gameId),
      betType: String(betType),
      betValue: betValue ? String(betValue) : undefined,
      odds: Number(odds),
      potentialWin: Number(potentialWin),
      transactionId: String(transactionId),
      newBalance: Number(newBalance),
      timestamp: new Date().toISOString()
    };

    // Remove undefined values
    Object.keys(kafkaMessage).forEach(key => {
      if (kafkaMessage[key] === undefined) {
        delete kafkaMessage[key];
      }
    });

    const messageString = JSON.stringify(kafkaMessage);
    const messageSize = messageString.length;

    logger.info('Publishing message to Kafka topic bet-events', {
      betId,
      messageSize,
      messagePreview: messageString.substring(0, 200) + '...'
    });

    // Validate message size
    if (messageSize > 1000000) { // 1MB
      logger.error('Message too large for Kafka', {
        betId,
        messageSize,
        maxSize: 1000000,
        message: messageString
      });
      return;
    }

    // Additional safety check
    if (messageSize > 10000) { // 10KB
      logger.error('Message suspiciously large, aborting', {
        betId,
        messageSize,
        message: messageString
      });
      return;
    }

    // Add message to batch queue
    return new Promise<void>((resolve, reject) => {
      messageQueue.push({
        topic: 'bet-events',
        messages: [{
          key: betId,
          value: messageString
        }],
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Calculate compression ratio (approximate)
      const compressedSize = messageSize * 0.3; // gzip typically achieves 70% compression
      const compressionRatio = compressedSize / messageSize;
      kafkaCompressionRatio.set(compressionRatio);

      logger.info('Kafka message queued for batching', {
        betId,
        queueSize: messageQueue.length,
        compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`
      });

      // Process batch if it's full or schedule processing
      if (messageQueue.length >= BATCH_SIZE) {
        processBatch();
      } else {
        scheduleBatch();
      }
    });

  } catch (kafkaError) {
    logger.error('Kafka publishing failed:', kafkaError);
    isProducerConnected = false;
    throw kafkaError;
  }
}

// Consumer management
export async function connectConsumer(): Promise<void> {
  try {
    await consumer.connect();
    logger.info('Kafka consumer connected');
  } catch (error) {
    logger.error('Failed to connect Kafka consumer:', error);
    throw error;
  }
}

export async function disconnectConsumer(): Promise<void> {
  try {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected');
  } catch (error) {
    logger.error('Failed to disconnect Kafka consumer:', error);
  }
}

export async function subscribeToBetEvents(
  messageHandler: (betEvent: BetEventMessage, topic: string, partition: number, offset: string) => Promise<void>
): Promise<void> {
  try {
    await consumer.subscribe({ topic: 'bet-events', fromBeginning: false });
    logger.info('Kafka consumer subscribed to bet-events topic');

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = message.value?.toString();
          if (!messageValue) {
            logger.warn('Received empty message', { topic, partition, offset: message.offset });
            return;
          }

          const betEvent: BetEventMessage = JSON.parse(messageValue);

          logger.info('Processing bet event from Kafka', {
            betId: betEvent.betId,
            topic,
            partition,
            offset: message.offset
          });

          await messageHandler(betEvent, topic, partition, message.offset);

        } catch (error) {
          logger.error('Failed to process Kafka message:', error, {
            topic,
            partition,
            offset: message.offset,
            message: message.value?.toString()
          });
        }
      },
    });

  } catch (error) {
    logger.error('Failed to start Kafka consumer:', error);
    throw error;
  }
}
