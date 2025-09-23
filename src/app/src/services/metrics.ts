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

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(kafkaMessagesProduced);
register.registerMetric(kafkaMessagesConsumed);
register.registerMetric(betProcessingDuration);
register.registerMetric(databaseOperations);

// Helper function to get metrics
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}
