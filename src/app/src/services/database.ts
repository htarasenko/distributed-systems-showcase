import { Pool } from 'pg';
import { ClickHouse } from 'clickhouse';
import config from '../config';
import logger from '../utils/logger';

// PostgreSQL connection pool

export const pgPool = new Pool({
  connectionString: config.database.connectionString,
  max: config.database.max,
  min: config.database.min,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis
});

// ClickHouse connection
console.log('config.clickhouse.url', config.clickhouse.url);
console.log('config.clickhouse.database', config.clickhouse.database);
export const clickhouse = new ClickHouse({
  url: config.clickhouse.url,
  database: config.clickhouse.database
});

// Database health check
export async function checkDatabaseHealth(): Promise<{ postgresql: string; clickhouse: string }> {
  try {
    await pgPool.query('SELECT 1');
    await clickhouse.query('SELECT 1');

    return {
      postgresql: 'connected',
      clickhouse: 'connected'
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      postgresql: 'disconnected',
      clickhouse: 'disconnected'
    };
  }
}

// Graceful shutdown for database connections
export async function closeDatabaseConnections(): Promise<void> {
  try {
    await pgPool.end();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
  }
}
