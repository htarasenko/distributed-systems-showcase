const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const { ClickHouse } = require('clickhouse');
const { Kafka } = require('kafkajs');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const winston = require('winston');
const client = require('prom-client');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

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

const grpcRequestsTotal = new client.Counter({
  name: 'grpc_requests_total',
  help: 'Total number of gRPC requests',
  labelNames: ['method', 'status']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(kafkaMessagesProduced);
register.registerMetric(grpcRequestsTotal);

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});

// Database connections
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/distributed_systems'
});

const clickhouse = new ClickHouse({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  database: 'distributed_systems'
});

// Kafka configuration
const kafka = new Kafka({
  clientId: 'distributed-systems-app',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer();

// gRPC setup
const PROTO_PATH = __dirname + '/proto/wallet.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const walletProto = grpc.loadPackageDefinition(packageDefinition).wallet;
const grpcClient = new walletProto.WalletService(
  process.env.GRPC_WALLET_URL || 'localhost:50051',
  grpc.credentials.createInsecure()
);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connections
    await pgPool.query('SELECT 1');
    await clickhouse.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: 'connected',
        clickhouse: 'connected',
        kafka: 'connected'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Validation schemas
const betSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  amount: Joi.number().positive().required(),
  gameId: Joi.string().required(),
  betType: Joi.string().valid('single', 'multiple', 'system').required()
});

// Betting endpoint - demonstrates gRPC + Kafka workflow
app.post('/api/bet', async (req, res) => {
  const startTime = Date.now();
  const client = await pgPool.connect();
  
  try {
    // Validate input
    const { error, value } = betSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details
      });
    }

    const { userId, amount, gameId, betType } = value;
    const betId = uuidv4();
    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Processing bet', { betId, userId, amount, gameId, betType });

    // Step 1: PostgreSQL Transaction (ACID)
    await client.query('BEGIN');
    
    try {
      // Check user balance with row lock
      const balanceResult = await client.query(
        'SELECT balance, version FROM user_balances WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'User not found',
          betId
        });
      }

      const { balance, version } = balanceResult.rows[0];

      if (balance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Insufficient balance',
          betId,
          currentBalance: balance
        });
      }

      const newBalance = balance - amount;

      // Update balance with optimistic locking
      const updateResult = await client.query(
        'UPDATE user_balances SET balance = $1, version = version + 1, updated_at = NOW() WHERE user_id = $2 AND version = $3',
        [newBalance, userId, version]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Concurrent modification detected. Please retry.',
          betId
        });
      }

      // Insert transaction record
      await client.query(
        'INSERT INTO wallet_transactions (user_id, transaction_id, transaction_type, amount, balance_before, balance_after, bet_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [userId, transactionId, 'bet', amount, balance, newBalance, betId, 'completed']
      );

      // Commit transaction
      await client.query('COMMIT');

      const dbDuration = Date.now() - startTime;

      // Step 2: Response to user (immediate)
      res.json({
        betId,
        status: 'accepted',
        transactionId,
        newBalance,
        processingTime: {
          database: dbDuration,
          total: Date.now() - startTime
        }
      });

      // Step 3: Publish event to Kafka (asynchronous, after response)
      try {
        await producer.connect();
        const kafkaMessage = {
          betId,
          userId,
          amount,
          gameId,
          betType,
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
      throw dbError;
    }

  } catch (error) {
    logger.error('Bet processing failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      betId: req.body.betId || 'unknown'
    });
  } finally {
    client.release();
  }
});

// Get bet history from PostgreSQL
app.get('/api/bets/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pgPool.query(
      'SELECT * FROM bets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [userId]
    );

    res.json({
      userId,
      bets: result.rows
    });
  } catch (error) {
    logger.error('Failed to fetch bet history:', error);
    res.status(500).json({ error: 'Failed to fetch bet history' });
  }
});

// Get analytics from ClickHouse
app.get('/api/analytics/bets', async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'hour' } = req.query;
    
    let query = `
      SELECT 
        toStartOf${groupBy === 'hour' ? 'Hour' : 'Day'}(timestamp) as period,
        count() as bet_count,
        sum(amount) as total_amount,
        avg(amount) as avg_amount
      FROM bet_events 
      WHERE 1=1
    `;
    
    const params = [];
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
    
    res.json({
      analytics: result.data,
      groupBy,
      period: startDate && endDate ? { startDate, endDate } : 'all'
    });
  } catch (error) {
    logger.error('Failed to fetch analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  await producer.disconnect();
  await pgPool.end();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  await producer.disconnect();
  await pgPool.end();
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Distributed Systems App listening on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
});

module.exports = app;
