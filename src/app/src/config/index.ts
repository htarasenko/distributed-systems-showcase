import { AppConfig } from '../types';

export const config: AppConfig = {
  port: parseInt(process.env['PORT'] || '3000', 10),
  nodeEnv: process.env['NODE_ENV'] || 'development',

  database: {
    connectionString: process.env['DATABASE_URL'] || 'postgresql://postgres:postgres@localhost:5432/distributed_systems',
    max: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20', 10),
    min: parseInt(process.env['DB_MIN_CONNECTIONS'] || '5', 10),
    idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT'] || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env['DB_CONNECTION_TIMEOUT'] || '2000', 10)
  },

  kafka: {
    clientId: 'distributed-systems-app',
    brokers: (process.env['KAFKA_BROKERS'] || 'localhost:9092').split(','),
    retry: {
      initialRetryTime: 100,
      retries: 8
    }
  },

  clickhouse: {
    url: process.env['CLICKHOUSE_URL'] || 'http://localhost:8123',
    database: 'distributed_systems'
  }
};

export default config;
