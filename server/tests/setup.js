process.env.NODE_ENV = 'test';
process.env.MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/paper-trading-test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-min-16-chars';
process.env.LOG_LEVEL = 'silent';
process.env.INGEST_ENABLED = 'false';
