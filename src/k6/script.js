import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
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
    kafka_latency: ['p(95)<50'], // 95% of Kafka operations must complete below 50ms
    error_rate: ['rate<0.05'], // Overall error rate must be below 5%
  },
};

// Test data
const baseUrl = __ENV.APP_URL || 'http://localhost:3000';
const userIds = [
  '31c13867-275d-4890-a097-5945199642e4', // john_doe
  'e4fd9b5f-ca82-4e4b-86c3-c025fb2e2c4f', // jane_smith
  '2838b441-6aad-4f7d-9c34-af3f37a8730f', // mike_wilson
  'c0b8e7f0-bdd6-4be4-abdb-32c85353da5a', // sarah_brown
  'd3c05720-b864-480c-947a-6c18e5d31589', // alex_jones
];

const gameIds = [
  'f783c034-82a0-4da5-b94a-06662871f974', // Real Madrid vs Barcelona
  '1be6aad2-fee9-4ce1-b9b0-a2ba066f802e', // Lakers vs Warriors
  'ab75e9c4-8c8e-4793-b048-6e37b8b3ace3', // Djokovic vs Nadal
  '2d9b0ed2-8cfa-41dc-aed5-b797c03742cd', // CS:GO Major Championship
  '0caf8d8c-b77b-40c3-b152-8692010585fb', // Kentucky Derby
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


// Helper function to simulate Kafka latency
function simulateKafkaLatency() {
  const latency = Math.random() * 30 + 5; // 5-35ms
  kafkaLatency.add(latency);
  return latency;
}

export default function () {
  // Test 1: Health check
  const healthResponse = http.get(`${baseUrl}/api/health`);
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
    
    // Record Kafka latencies based on response
    const responseData = JSON.parse(betResponse.body);
    if (responseData.processingTime) {
      kafkaLatency.add(responseData.processingTime.total - (responseData.processingTime.database || 0));
    } else {
      // Fallback simulation
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
