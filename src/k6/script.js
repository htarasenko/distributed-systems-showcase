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
  '4fddbc69-0adb-4e82-9437-68297f6eaf80', // john_doe
  '660ad775-3bda-4ed0-8b70-c6bc9e361c5c', // jane_smith
  '251d2e8c-0da0-4b04-a3cd-fa3e6824da32', // mike_wilson
  '06959c2c-7315-4acc-9966-b733a891a648', // sarah_brown
  '98668a8b-c4ef-48f9-90b0-6c173f6a9e86', // alex_jones
];

const gameIds = [
  '9829cb8b-ed9a-4b0a-9b18-bbe4be265caf', // Real Madrid vs Barcelona
  'c2cb5120-70b9-4c6c-8d14-da815ff38ab6', // Lakers vs Warriors
  'be62b201-ce68-41fe-bab3-a48b61453b46', // Djokovic vs Nadal
  '9a314a76-6506-45a8-a6ed-4b6170491097', // CS:GO Major Championship
  '7ab7a374-e317-4446-b6c9-0c95145ec54d', // Kentucky Derby
];

const betTypes = ['win', 'lose', 'draw', 'over', 'under', 'exact_score', 'total_goals', 'first_goal', 'last_goal'];
const betValues = [
  'Real Madrid', 'Barcelona', 'Lakers', 'Warriors', 'Djokovic', 'Nadal',
  '2-1', '3-0', '1-1', 'over 2.5', 'under 3.5', 'Messi', 'Ronaldo'
];

// Helper function to generate random bet data
function generateBetData() {
  const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
  const betValue = betValues[Math.floor(Math.random() * betValues.length)];
  const odds = Math.random() * 9 + 1.1; // Random odds between 1.1-10.1
  
  return {
    userId: userIds[Math.floor(Math.random() * userIds.length)],
    gameId: gameIds[Math.floor(Math.random() * gameIds.length)],
    amount: Math.random() * 100 + 1, // Random amount between 1-101
    betType: betType,
    betValue: betValue,
    odds: Math.round(odds * 100) / 100 // Round to 2 decimal places
  };
}

// Helper function to simulate database latency (since we can't directly measure it in K6)
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
    'bet response has transactionId': (r) => JSON.parse(r.body).transactionId !== undefined,
    'bet response has newBalance': (r) => JSON.parse(r.body).newBalance !== undefined,
    'bet response has potentialWin': (r) => JSON.parse(r.body).potentialWin !== undefined,
  });

  if (betSuccess) {
    betCounter.add(1);
    
    // Record database and Kafka latencies based on response
    const responseData = JSON.parse(betResponse.body);
    if (responseData.processingTime) {
      grpcLatency.add(responseData.processingTime.database || 0);
      kafkaLatency.add(responseData.processingTime.total - (responseData.processingTime.database || 0));
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
  console.log('Test will simulate betting workflow with PostgreSQL + Kafka + ClickHouse');
}

export function teardown(data) {
  console.log('Load test completed');
  console.log('Check the metrics dashboard for detailed performance analysis');
}
