// Vitest setup — runs once before the test suite.
// Forces NODE_ENV=test so app.ts disables logging and request bookkeeping.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
