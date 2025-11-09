/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  testTimeout: 15000,
  maxWorkers: 1,
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
};
