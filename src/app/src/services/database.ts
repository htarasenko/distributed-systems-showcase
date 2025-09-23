import { Pool } from 'pg';
import { ClickHouse } from 'clickhouse';
import config from '../config';
import logger from '../utils/logger';
import {
  connectionPoolTotal,
  connectionPoolIdle,
  connectionPoolWaiting,
  connectionPoolUtilization
} from './metrics';

// PostgreSQL connection pool
export const pgPool = new Pool({
  connectionString: config.database.connectionString,
  max: config.database.max,
  min: config.database.min,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis
});

// Connection pool monitoring
setInterval(() => {
  const poolStats = {
    totalCount: pgPool.totalCount,
    idleCount: pgPool.idleCount,
    waitingCount: pgPool.waitingCount
  };

  // Update Prometheus metrics
  connectionPoolTotal.set(poolStats.totalCount);
  connectionPoolIdle.set(poolStats.idleCount);
  connectionPoolWaiting.set(poolStats.waitingCount);

  // Calculate and set utilization ratio
  const utilization = (poolStats.totalCount - poolStats.idleCount) / (config.database.max || 50);
  connectionPoolUtilization.set(utilization);

  logger.info('Connection Pool Stats:', {
    ...poolStats,
    utilization: `${(utilization * 100).toFixed(1)}%`
  });

  // Log warning if pool is getting full
  if (poolStats.waitingCount > 0) {
    logger.warn(`Connection pool has ${poolStats.waitingCount} waiting connections`);
  }

  // Log warning if pool utilization is high
  if (utilization > 0.8) {
    logger.warn(`Connection pool utilization is ${(utilization * 100).toFixed(1)}%`);
  }
}, 30000); // Log every 30 seconds

// ClickHouse connection
console.log('config.clickhouse.url', config.clickhouse.url);
console.log('config.clickhouse.database', config.clickhouse.database);
export const clickhouse = new ClickHouse({
  url: config.clickhouse.url,
  database: config.clickhouse.database
});

// Database health check
export async function checkDatabaseHealth(): Promise<{ postgresql: 'connected' | 'disconnected'; clickhouse: 'connected' | 'disconnected' }> {
  try {
    await pgPool.query('SELECT 1');
    await clickhouse.query('SELECT 1');

    return {
      postgresql: 'connected' as const,
      clickhouse: 'connected' as const
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      postgresql: 'disconnected' as const,
      clickhouse: 'disconnected' as const
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
