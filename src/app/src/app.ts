import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import config from './config';
import logger from './utils/logger';
import { register, getMetrics } from './services/metrics';
import { initializeClickHouseTable } from './services/clickhouse';
import { connectConsumer, disconnectConsumer, subscribeToBetEvents } from './services/kafka';
import { closeDatabaseConnections } from './services/database';
import { BetService } from './services/bet';
import routes from './routes';
import { requestTiming, errorHandler, notFoundHandler } from './middleware';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(requestTiming);

// Routes
app.use('/api', routes);

// Metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await getMetrics());
});

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);

  try {
    await disconnectConsumer();
    await closeDatabaseConnections();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize application
async function initializeApp(): Promise<void> {
  try {
    // Initialize ClickHouse
    await initializeClickHouseTable();

    // Start Kafka consumer
    await connectConsumer();
    await subscribeToBetEvents(BetService.processBetEvent);

    logger.info('App initialization completed');
  } catch (error) {
    logger.error('App initialization failed:', error);
    throw error;
  }
}

// Start server
app.listen(config.port, async () => {
  logger.info(`Distributed Systems App listening on port ${config.port}`);
  logger.info(`Health check: http://localhost:${config.port}/api/health`);
  logger.info(`Metrics: http://localhost:${config.port}/metrics`);

  // Initialize services
  await initializeApp();
});

export default app;