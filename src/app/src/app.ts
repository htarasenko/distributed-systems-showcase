import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Pool, PoolClient } from 'pg';
import { ClickHouse } from 'clickhouse';
import { Kafka, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import * as client from 'prom-client';
import dotenv from 'dotenv';

import config from './config';
import logger from './utils/logger';
import { betSchema, analyticsQuerySchema, betHistoryQuerySchema } from './utils/validation';
import {
  BetRequest,
  BetResponse,
  HealthCheckResponse,
  AnalyticsResponse,
  BetEventMessage,
  AppError,
  ValidationError,
  DatabaseError
} from './types';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Initialize metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const kafkaMessagesProduced = new client.Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total number of Kafka messages produced',
  labelNames: ['topic']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(kafkaMessagesProduced);

// Database connections
const pgPool = new Pool({
  connectionString: config.database.connectionString,
  max: config.database.max,
  min: config.database.min,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis
});

const clickhouse = new ClickHouse({
  url: config.clickhouse.url,
  database: config.clickhouse.database
});

// Kafka configuration
const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: config.kafka.retry
});

const producer: Producer = kafka.producer();


// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Request timing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Check database connections
    await pgPool.query('SELECT 1');
    await clickhouse.query('SELECT 1');

    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: 'connected',
        clickhouse: 'connected',
        kafka: 'connected'
      }
    };

    res.json(response);
    return;
  } catch (error) {
    logger.error('Health check failed:', error);
    const response: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: 'disconnected',
        clickhouse: 'disconnected',
        kafka: 'disconnected'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(503).json(response);
  }
});

// Metrics endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Betting endpoint - demonstrates PostgreSQL + Kafka workflow
app.post('/api/bet', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  let client: PoolClient | null = null;

  try {
    // Validate input
    const { error, value } = betSchema.validate(req.body);
    if (error) {
      throw new ValidationError('Validation failed');
    }

    const { userId, gameId, amount, betType, betValue, odds } = value as BetRequest;
    const betId = uuidv4();
    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Processing bet', { betId, userId, amount, gameId, betType, betValue, odds });

    // Get database connection
    client = await pgPool.connect();

    // Step 1: PostgreSQL Transaction (ACID)
    await client.query('BEGIN');

    try {
      // Check user balance with row lock
      const balanceResult = await client.query(
        'SELECT balance, version FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        const response: BetResponse = {
          betId,
          status: 'rejected',
          error: 'User not found'
        };
        res.status(400).json(response);
        return;
      }

      const { balance, version } = balanceResult.rows[0] as { balance: number; version: number };

      if (balance < amount) {
        await client.query('ROLLBACK');
        const response: BetResponse = {
          betId,
          status: 'rejected',
          error: 'Insufficient balance',
          details: { currentBalance: balance }
        };
        res.status(400).json(response);
        return;
      }

      const newBalance = balance - amount;

      // Update balance with optimistic locking
      const updateResult = await client.query(
        'UPDATE users SET balance = $1, version = version + 1, updated_at = NOW() WHERE id = $2 AND version = $3',
        [newBalance, userId, version]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        const response: BetResponse = {
          betId,
          status: 'rejected',
          error: 'Concurrent modification detected. Please retry.'
        };
        res.status(409).json(response);
        return;
      }

      // Calculate potential win
      const potentialWin = amount * odds;

      // Insert bet record
      await client.query(
        'INSERT INTO bets (id, user_id, game_id, amount, bet_type, bet_value, odds, potential_win, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [betId, userId, gameId, amount, betType, betValue, odds, potentialWin, 'pending']
      );

      // Insert transaction record
      await client.query(
        'INSERT INTO wallet_transactions (user_id, transaction_id, transaction_type, amount, balance_before, balance_after, bet_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, transactionId, 'bet', amount, balance, newBalance, betId]
      );

      // Commit transaction
      await client.query('COMMIT');

      const dbDuration = Date.now() - startTime;

      // Step 2: Response to user (immediate)
      const response: BetResponse = {
        betId,
        status: 'accepted',
        transactionId,
        newBalance,
        potentialWin,
        processingTime: {
          database: dbDuration,
          total: Date.now() - startTime
        }
      };

      res.json(response);

      // Step 3: Publish event to Kafka (asynchronous, after response)
      try {
        await producer.connect();
        const kafkaMessage: BetEventMessage = {
          betId,
          userId,
          amount,
          gameId,
          betType,
          ...(betValue && { betValue }),
          odds,
          potentialWin,
          transactionId,
          newBalance,
          timestamp: new Date().toISOString()
        };

        await producer.send({
          topic: 'bet-events',
          messages: [{
            key: betId,
            value: JSON.stringify(kafkaMessage)
          }]
        });

        kafkaMessagesProduced.labels('bet-events').inc();

        logger.info('Bet processed successfully', {
          betId,
          transactionId,
          newBalance,
          dbDuration
        });

      } catch (kafkaError) {
        logger.error('Kafka publishing failed (bet was successful):', kafkaError);
        // Don't fail the request - bet was already processed
      }

    } catch (dbError) {
      await client.query('ROLLBACK');
      throw new DatabaseError('Database transaction failed', dbError as Error);
    }

  } catch (error) {
    logger.error('Bet processing failed:', error);

    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    } else if (error instanceof DatabaseError) {
      statusCode = error.statusCode || 500;
      errorMessage = error.message;
    }

    const response: BetResponse = {
      betId: (req.body as any)?.betId || 'unknown',
      status: 'rejected',
      error: errorMessage
    };

    res.status(statusCode).json(response);
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Get bet history from PostgreSQL
app.get('/api/bets/:userId', async (req: Request, res: Response) => {
  try {
    const { error, value } = betHistoryQuerySchema.validate({
      userId: req.params['userId'],
      ...req.query
    });

    if (error) {
      throw new ValidationError('Invalid query parameters');
    }

    const { userId, limit, offset } = value;

    const result = await pgPool.query(
      'SELECT b.*, g.name as game_name, g.game_type, g.status as game_status FROM bets b JOIN games g ON b.game_id = g.id WHERE b.user_id = $1 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );

    res.json({
      userId,
      bets: result.rows,
      pagination: {
        limit,
        offset,
        total: result.rows.length
      }
    });
  } catch (error) {
    logger.error('Failed to fetch bet history:', error);

    let statusCode = 500;
    let errorMessage = 'Failed to fetch bet history';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

// Get analytics from ClickHouse
app.get('/api/analytics/bets', async (req: Request, res: Response) => {
  try {
    const { error, value } = analyticsQuerySchema.validate(req.query);

    if (error) {
      throw new ValidationError('Invalid query parameters');
    }

    const { startDate, endDate, groupBy } = value;

    let query = `
      SELECT 
        toStartOf${groupBy === 'hour' ? 'Hour' : 'Day'}(timestamp) as period,
        count() as bet_count,
        sum(amount) as total_amount,
        avg(amount) as avg_amount
      FROM bet_events 
      WHERE 1=1
    `;

    const params: string[] = [];
    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY period ORDER BY period';

    const result = await clickhouse.query(query, { params });

    const response: AnalyticsResponse = {
      analytics: (result as any).data as Array<{
        period: string;
        bet_count: number;
        total_amount: number;
        avg_amount: number;
      }>,
      groupBy,
      period: startDate && endDate ? { startDate, endDate } : 'all'
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to fetch analytics:', error);

    let statusCode = 500;
    let errorMessage = 'Failed to fetch analytics';

    if (error instanceof ValidationError) {
      statusCode = error.statusCode || 400;
      errorMessage = error.message;
    }

    res.status(statusCode).json({ error: errorMessage });
  }
});

// Error handling middleware
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', error);

  let statusCode = 500;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode || 500;
    message = error.message;
  }

  res.status(statusCode).json({
    error: message,
    ...(config.nodeEnv === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found'
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    await producer.disconnect();
    await pgPool.end();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(config.port, () => {
  logger.info(`Distributed Systems App listening on port ${config.port}`);
  logger.info(`Health check: http://localhost:${config.port}/health`);
  logger.info(`Metrics: http://localhost:${config.port}/metrics`);
});

export default app;