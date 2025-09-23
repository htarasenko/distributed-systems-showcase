import * as client from 'prom-client';

// Initialize metrics registry
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

export const kafkaMessagesProduced = new client.Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total number of Kafka messages produced',
  labelNames: ['topic']
});

export const kafkaMessagesConsumed = new client.Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total number of Kafka messages consumed',
  labelNames: ['topic']
});

// Kafka batching metrics
export const kafkaBatchSize = new client.Histogram({
  name: 'kafka_batch_size',
  help: 'Size of Kafka message batches',
  buckets: [1, 5, 10, 25, 50, 100, 200]
});

export const kafkaBatchLatency = new client.Histogram({
  name: 'kafka_batch_latency_seconds',
  help: 'Time spent waiting for batch completion',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

export const kafkaCompressionRatio = new client.Gauge({
  name: 'kafka_compression_ratio',
  help: 'Compression ratio of Kafka messages (compressed/original)'
});

export const betProcessingDuration = new client.Histogram({
  name: 'bet_processing_duration_seconds',
  help: 'Duration of bet processing in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

export const databaseOperations = new client.Counter({
  name: 'database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'table', 'status']
});

// Connection pool metrics
export const connectionPoolTotal = new client.Gauge({
  name: 'database_connection_pool_total',
  help: 'Total number of connections in the pool'
});

export const connectionPoolIdle = new client.Gauge({
  name: 'database_connection_pool_idle',
  help: 'Number of idle connections in the pool'
});

export const connectionPoolWaiting = new client.Gauge({
  name: 'database_connection_pool_waiting',
  help: 'Number of connections waiting for a pool connection'
});

export const connectionPoolUtilization = new client.Gauge({
  name: 'database_connection_pool_utilization_ratio',
  help: 'Connection pool utilization ratio (0-1)'
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(kafkaMessagesProduced);
register.registerMetric(kafkaMessagesConsumed);
register.registerMetric(kafkaBatchSize);
register.registerMetric(kafkaBatchLatency);
register.registerMetric(kafkaCompressionRatio);
register.registerMetric(betProcessingDuration);
register.registerMetric(databaseOperations);
register.registerMetric(connectionPoolTotal);
register.registerMetric(connectionPoolIdle);
register.registerMetric(connectionPoolWaiting);
register.registerMetric(connectionPoolUtilization);

// Helper function to get metrics
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}
