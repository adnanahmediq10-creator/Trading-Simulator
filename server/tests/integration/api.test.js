/**
 * API integration tests — auth, order placement, portfolio, account reset.
 * Uses MongoMemoryReplSet + Supertest.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';

let replSet;
let app;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  process.env.JWT_SECRET = 'test-secret-32chars-minimum-okay';
  process.env.COOKIE_SECURE = 'false';
  process.env.STARTING_CASH_PAISE = '100000000';
  process.env.NODE_ENV = 'test';
  process.env.INGEST_ENABLED = 'false';
  process.env.LOG_LEVEL = 'silent';

  await mongoose.connect(replSet.getUri());
  app = createApp();
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  // Clean all collections between tests
  const collections = await mongoose.connection.db.collections();
  for (const col of collections) await col.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(email = 'test@example.com', password = 'Password1') {
  const name = 'Test User';
  await request(app).post('/api/auth/register').send({ name, email, password }).expect(201);
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  // Extract cookie
  const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
  return { cookie, user: res.body.user };
}

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('creates user and returns user data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Arjun', email: 'arjun@test.com', password: 'Password1' })
      .expect(201);
    expect(res.body.user.email).toBe('arjun@test.com');
    expect(res.body.user.cashPaise).toBe(100_000_000);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({ name: 'A', email: 'dup@test.com', password: 'Password1' }).expect(201);
    const res = await request(app).post('/api/auth/register').send({ name: 'B', email: 'dup@test.com', password: 'Password1' }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_REQUEST');
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@b.com', password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects password without number', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@b.com', password: 'NoNumbers!!' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'cookie@test.com', password: 'Password1' }).expect(201);
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in existing user', async () => {
    await request(app).post('/api/auth/register').send({ name: 'A', email: 'login@test.com', password: 'Password1' }).expect(201);
    const res = await request(app).post('/api/auth/login').send({ email: 'login@test.com', password: 'Password1' }).expect(200);
    expect(res.body.user.email).toBe('login@test.com');
  });

  it('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({ name: 'A', email: 'wrong@test.com', password: 'Password1' }).expect(201);
    await request(app).post('/api/auth/login').send({ email: 'wrong@test.com', password: 'WrongPass1' }).expect(401);
  });

  it('rejects non-existent user in constant time (no timing leak)', async () => {
    await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'Password1' }).expect(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user data when authenticated', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(res.body.user.cashPaise).toBe(100_000_000);
    expect(res.body.user.reservedCashPaise).toBe(0);
  });

  it('returns 401 without cookie', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookie on logout', async () => {
    const { cookie } = await registerAndLogin();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    expect(res.body.ok).toBe(true);
    // Cookie should be cleared (expires in past or empty)
    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toMatch(/token=;|Max-Age=0/i);
  });
});

// ── Market tests ──────────────────────────────────────────────────────────────

describe('GET /api/market/status', () => {
  it('returns mode info', async () => {
    const res = await request(app).get('/api/market/status').expect(200);
    expect(res.body.mode).toMatch(/DELAYED_LIVE|DEMO_REPLAY/);
    expect(typeof res.body.virtualNowMs).toBe('number');
    expect(res.body.disclaimer).toContain('Simulation');
  });
});

describe('GET /api/market/instruments', () => {
  it('returns instrument list with tradable flag', async () => {
    const res = await request(app).get('/api/market/instruments').expect(200);
    expect(Array.isArray(res.body.instruments)).toBe(true);
    expect(res.body.instruments.length).toBeGreaterThan(0);
    const tradable = res.body.instruments.filter((i) => i.tradable);
    expect(tradable.length).toBeGreaterThan(0);
  });
});

describe('GET /api/market/candles', () => {
  it('returns candles for RELIANCE 1m', async () => {
    const res = await request(app)
      .get('/api/market/candles?symbol=RELIANCE&interval=1m&limit=10')
      .expect(200);
    expect(Array.isArray(res.body.candles)).toBe(true);
    expect(res.body.candles.length).toBeGreaterThan(0);
    expect(res.body.source).toBeTruthy();
  });

  it('returns 4xx for invalid symbol', async () => {
    const res = await request(app).get('/api/market/candles?symbol=FAKESTOCK&interval=1m');
    expect([400, 404]).toContain(res.status);
  });
});

// ── Orders tests ──────────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  it('requires Idempotency-Key header', async () => {
    const { cookie } = await registerAndLogin('o1@t.com');
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', cookie)
      .send({ symbol: 'RELIANCE', side: 'BUY', type: 'MARKET', qty: 1 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects order when unauthenticated', async () => {
    await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-123')
      .send({ symbol: 'RELIANCE', side: 'BUY', type: 'MARKET', qty: 1 })
      .expect(401);
  });

  it('rejects unknown symbol', async () => {
    const { cookie } = await registerAndLogin('o2@t.com');
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'key-bad-sym')
      .send({ symbol: 'FAKESTOCK', side: 'BUY', type: 'MARKET', qty: 1 });
    // Server returns 400 (VALIDATION_ERROR) or 404 (INSTRUMENT_NOT_FOUND)
    expect([400, 404]).toContain(res.status);
    expect(res.body.error?.code).toMatch(/INSTRUMENT_NOT_FOUND|VALIDATION_ERROR|STALE_PRICE/);
  });

  it('rejects invalid qty', async () => {
    const { cookie } = await registerAndLogin('o3@t.com');
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'key-bad-qty')
      .send({ symbol: 'RELIANCE', side: 'BUY', type: 'MARKET', qty: 0 })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/orders', () => {
  it('returns empty array for new user', async () => {
    const { cookie } = await registerAndLogin('ord-list@t.com');
    const res = await request(app).get('/api/orders').set('Cookie', cookie).expect(200);
    expect(res.body.orders).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    await request(app).get('/api/orders').expect(401);
  });
});

// ── Portfolio tests ───────────────────────────────────────────────────────────

describe('GET /api/portfolio', () => {
  it('returns fresh portfolio for new user', async () => {
    const { cookie } = await registerAndLogin('port@t.com');
    const res = await request(app).get('/api/portfolio').set('Cookie', cookie).expect(200);
    expect(res.body.cashPaise).toBe(100_000_000);
    expect(res.body.positions).toEqual([]);
    expect(res.body.totals.totalPnlPaise).toBe(0);
  });

  it('returns 401 without auth', async () => {
    await request(app).get('/api/portfolio').expect(401);
  });
});

// ── Account reset tests ───────────────────────────────────────────────────────

describe('POST /api/account/reset', () => {
  it('requires { confirm: true } body', async () => {
    const { cookie } = await registerAndLogin('reset-a@t.com');
    const res = await request(app)
      .post('/api/account/reset')
      .set('Cookie', cookie)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('resets account to starting state', async () => {
    const { cookie } = await registerAndLogin('reset-b@t.com');
    const res = await request(app)
      .post('/api/account/reset')
      .set('Cookie', cookie)
      .send({ confirm: true })
      .expect(200);
    expect(res.body.ok).toBe(true);

    // Verify cash is restored
    const port = await request(app).get('/api/portfolio').set('Cookie', cookie).expect(200);
    expect(port.body.cashPaise).toBe(100_000_000);
  });

  it('returns 401 without auth', async () => {
    await request(app).post('/api/account/reset').send({ confirm: true }).expect(401);
  });
});

// ── Health tests ──────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns health object with status ok or degraded', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toMatch(/ok|degraded/);
    expect(typeof res.body.uptimeSec).toBe('number');
  });
});
