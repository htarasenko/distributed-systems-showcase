import { Kafka, Producer, Consumer } from 'kafkajs';
import config from '../config';
import logger from '../utils/logger';
import { BetEventMessage } from '../types';

// Kafka configuration
const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: config.kafka.retry
});

export const producer: Producer = kafka.producer();
export const consumer: Consumer = kafka.consumer({ groupId: 'bet-events-consumer' });

// Producer connection management
let isProducerConnected = false;

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
    await producer.disconnect();
    isProducerConnected = false;
    logger.info('Kafka producer disconnected');
  }
}

// Kafka message publishing
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

    await producer.send({
      topic: 'bet-events',
      messages: [{
        key: betId,
        value: messageString
      }]
    });

    logger.info('Kafka message published successfully', { betId });

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
