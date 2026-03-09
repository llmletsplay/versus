/** @type {import('jest').Config} */
export default {
  // Use ts-jest for TypeScript support with ES modules
  preset: 'ts-jest/presets/default-esm',

  // Extensions to treat as ES modules
  extensionsToTreatAsEsm: ['.ts'],

  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: ['**/tests/**/*.test.ts', '**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output for debugging
  verbose: true,

  // Timeout for async tests (games can be complex)
  testTimeout: 10000,

  // Module name mapping for ES modules (correct property name)
  moduleNameMapper: {
    '^@llmletsplay/versus-(.*)$': '<rootDir>/../packages/$1/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Transform patterns with ts-jest config
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
        transpilation: {
          compilerOptions: {
            target: 'ES2022',
            module: 'CommonJS',
          },
        },
      },
    ],
  },
};
