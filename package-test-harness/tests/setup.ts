// Test setup file for jest
import { jest } from '@jest/globals';
import { SQLiteProvider } from '../src/core/database.js';

// Global test utilities
export async function createTestDatabase(): Promise<SQLiteProvider> {
  const db = new SQLiteProvider(':memory:');
  await db.initialize();
  return db;
}

// Suppress console output during tests unless explicitly testing it
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test setup
beforeEach(() => {
  // Reset any global state before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});
