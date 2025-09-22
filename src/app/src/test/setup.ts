// Test setup file for Jest
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env['NODE_ENV'] = 'test';

// Mock external services for testing
jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined)
    })
  }))
}));

jest.mock('@grpc/grpc-js', () => ({
  loadPackageDefinition: jest.fn(),
  credentials: {
    createInsecure: jest.fn()
  }
}));

jest.mock('@grpc/proto-loader', () => ({
  loadSync: jest.fn()
}));

// Global test timeout
jest.setTimeout(10000);
