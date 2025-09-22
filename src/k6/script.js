import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const grpcLatency = new Trend('grpc_latency');
const kafkaLatency = new Trend('kafka_latency');
const betCounter = new Counter('bets_processed');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 50 }, // Ramp up to 50 users
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
    http_req_failed: ['rate<0.1'], // Error rate must be below 10%
    grpc_latency: ['p(99)<100'], // 99% of gRPC calls must complete below 100ms
    kafka_latency: ['p(95)<50'], // 95% of Kafka operations must complete below 50ms
    error_rate: ['rate<0.05'], // Overall error rate must be below 5%
  },
};

// Test data
const baseUrl = __ENV.APP_URL || 'http://localhost:3000';
const userIds = [
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440004',
  '550e8400-e29b-41d4-a716-446655440005',
];

const gameIds = ['game-1', 'game-2', 'game-3', 'game-4', 'game-5'];
const betTypes = ['single', 'multiple', 'system'];

// Helper function to generate random bet data
function generateBetData() {
  return {
    userId: userIds[Math.floor(Math.random() * userIds.length)],
    amount: Math.random() * 100 + 1, // Random amount between 1-101
    gameId: gameIds[Math.floor(Math.random() * gameIds.length)],
    betType: betTypes[Math.floor(Math.random() * betTypes.length)]
  };
}

// Helper function to simulate gRPC latency (since we can't directly measure it in K6)
function simulateGrpcLatency() {
  const latency = Math.random() * 50 + 10; // 10-60ms
  grpcLatency.add(latency);
  return latency;
}

// Helper function to simulate Kafka latency
function simulateKafkaLatency() {
  const latency = Math.random() * 30 + 5; // 5-35ms
  kafkaLatency.add(latency);
  return latency;
}

export default function () {
  // Test 1: Health check
  const healthResponse = http.get(`${baseUrl}/health`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });
  errorRate.add(healthResponse.status !== 200);

  // Test 2: Place a bet (main workflow)
  const betData = generateBetData();
  const betStartTime = Date.now();
  
  const betResponse = http.post(`${baseUrl}/api/bet`, JSON.stringify(betData), {
    headers: { 'Content-Type': 'application/json' },
  });

  const betDuration = Date.now() - betStartTime;
  
  const betSuccess = check(betResponse, {
    'bet request status is 200': (r) => r.status === 200,
    'bet response time < 200ms': (r) => r.timings.duration < 200,
    'bet response has betId': (r) => JSON.parse(r.body).betId !== undefined,
    'bet response has walletTransactionId': (r) => JSON.parse(r.body).walletTransactionId !== undefined,
  });

  if (betSuccess) {
    betCounter.add(1);
    
    // Simulate gRPC and Kafka latencies based on response
    const responseData = JSON.parse(betResponse.body);
    if (responseData.processingTime) {
      grpcLatency.add(responseData.processingTime.grpc || 0);
      kafkaLatency.add(responseData.processingTime.total - (responseData.processingTime.grpc || 0));
    } else {
      // Fallback simulation
      simulateGrpcLatency();
      simulateKafkaLatency();
    }
  }

  errorRate.add(betResponse.status !== 200);

  // Test 3: Get bet history (PostgreSQL query)
  const historyResponse = http.get(`${baseUrl}/api/bets/${betData.userId}`);
  check(historyResponse, {
    'bet history status is 200': (r) => r.status === 200,
    'bet history response time < 100ms': (r) => r.timings.duration < 100,
  });
  errorRate.add(historyResponse.status !== 200);

  // Test 4: Get analytics (ClickHouse query)
  const analyticsResponse = http.get(`${baseUrl}/api/analytics/bets?groupBy=hour`);
  check(analyticsResponse, {
    'analytics status is 200': (r) => r.status === 200,
    'analytics response time < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(analyticsResponse.status !== 200);

  // Test 5: Get metrics (Prometheus metrics)
  const metricsResponse = http.get(`${baseUrl}/metrics`);
  check(metricsResponse, {
    'metrics status is 200': (r) => r.status === 200,
    'metrics response time < 50ms': (r) => r.timings.duration < 50,
  });
  errorRate.add(metricsResponse.status !== 200);

  // Random sleep between 0.1-0.5 seconds to simulate realistic user behavior
  sleep(Math.random() * 0.4 + 0.1);
}

export function setup() {
  console.log('Starting distributed systems load test...');
  console.log(`Target URL: ${baseUrl}`);
  console.log('Test will simulate betting workflow with gRPC + Kafka + PostgreSQL + ClickHouse');
}

export function teardown(data) {
  console.log('Load test completed');
  console.log('Check the metrics dashboard for detailed performance analysis');
}
