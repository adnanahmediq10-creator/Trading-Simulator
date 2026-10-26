# TradeVirtual — NSE Paper Trading Simulator

> **⚠ SIMULATION ONLY. Virtual money. Not financial advice. Prices may be delayed or simulated.**

A full-stack MERN paper-trading brokerage simulator for Indian equities. Users receive ₹10,00,000 of virtual cash and trade 9 large-cap NSE stocks against a **virtual market clock** that replays real NSE 1-minute candles.

---

## Problem Statement

Beginners learn order types, buying power, average cost, and P&L only by trading real money. Existing simulators are shallow. TradeVirtual solves this with a complete order lifecycle (market fills, limit reservations, automatic matching, realised P&L) backed by a transactional engine.

## Target Users

Indian retail learners who want to practise NSE trading without financial risk.

## Key Features

- 📈 **Live candlestick charts** — 1m, 5m, 15m, 1D via lightweight-charts 4.x
- 🕐 **Virtual market clock** — replays real NSE 1m candles; 15-min delayed live on weekdays, demo replay on weekends/evenings
- 💹 **Market orders** — filled atomically against the latest tick
- 📋 **Limit orders** — reserves funds/shares, fills automatically when price crosses
- 🛡 **Race-safe fills** — single atomic claim per order via MongoDB transactions
- 💰 **Integer paise arithmetic** — no floats in storage or engine math
- 🔄 **3-level data fallback** — MongoDB → committed snapshot → synthetic seeded random walk
- 🔁 **Circuit breaker** — Yahoo Finance ingest degrades gracefully, never crashes
- 🔌 **Real-time Socket.IO** — 1 Hz tick feed, private order/portfolio events
- 📊 **Portfolio P&L** — unrealised, realised, equity, day change
- 🔒 **httpOnly cookie auth** — JWT, origin check, rate limits

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node 20, Express 4 |
| Database | MongoDB Atlas (M0, transactions via replica set) |
| Real-time | Socket.IO 4 |
| Auth | JWT + httpOnly cookie, bcryptjs |
| Validation | Zod |
| Logging | pino + pino-http |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS 4 |
| Data fetching | TanStack Query |
| Charts | lightweight-charts 4.x |
| Testing | Vitest + Supertest + mongodb-memory-server (MongoMemoryReplSet) |
| Deploy | Render (single web service) |

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram and component descriptions.

**Major components:**
- **Virtual Clock** (`server/src/market/clock.js`) — pure IST timezone math, deterministic mode selection
- **Tick Generator** (`server/src/market/tickGenerator.js`) — seeded PRNG produces plausible intra-minute prices from OHLCV candles
- **Price Service** (`server/src/market/priceService.js`) — 1 Hz EventEmitter, feeds Socket.IO
- **Candle Store** (`server/src/market/candleStore.js`) — 3-level fallback chain (DB → snapshot → synthetic)
- **Order Engine** (`server/src/engine/`) — transactional fills with conditional `$inc` guards
- **Matcher** (`server/src/engine/matcher.js`) — in-memory limit order index, rebuilt at boot, sequential per-symbol queue
- **Socket Layer** (`server/src/sockets/index.js`) — cookie auth, user rooms, market broadcast

---

## Local Setup

### Prerequisites

- Node.js 20+
- npm 10+
- MongoDB Atlas account (free M0 cluster) **OR** a local MongoDB 6+ replica set

### 1. Clone and install

```bash
git clone <repo-url>
cd endterm
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
# Edit .env with your real values:
#   MONGODB_URI — Atlas connection string
#   JWT_SECRET  — random 32+ char string
```

### 3. Run in development

```bash
npm run dev
# Server: http://localhost:4000
# Client: http://localhost:5173  (Vite dev server, proxied to server)
```

### 4. Run tests

```bash
npm test
# All 94 tests pass (unit + integration, using MongoMemoryReplSet)
```

### 5. Snapshot candles (run once, data committed)

```bash
npm run snapshot
# Writes server/data/snapshot/<SYMBOL>.json
# Run from a network where Yahoo Finance works
# Committed snapshots already exist as a fallback
```

### 6. Seed demo user (optional)

```bash
# In .env, set SEED_DEMO_USER=true
npm run seed
# Creates demo@example.com / Demo1234
```

### 7. Production build

```bash
npm run build     # builds client/dist
npm start         # serves API + built client
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` or `development` |
| `PORT` | no | `4000` | HTTP port |
| `MONGODB_URI` | **yes** | — | MongoDB Atlas connection string |
| `JWT_SECRET` | **yes** | — | Random 32+ char secret for JWT signing |
| `JWT_EXPIRES_IN` | no | `7d` | JWT expiry |
| `COOKIE_SECURE` | no | `false` | Set `true` in production (HTTPS) |
| `STARTING_CASH_PAISE` | no | `100000000` | Starting virtual cash in paise (₹10L) |
| `REPLAY_SPEED` | no | `30` | Virtual seconds per wall second in DEMO_REPLAY |
| `LIVE_DELAY_MINUTES` | no | `15` | NSE live delay in minutes |
| `STALE_AFTER_MS` | no | `30000` | Tick staleness threshold |
| `INGEST_ENABLED` | no | `true` | Set `false` to disable Yahoo ingest |
| `SEED_DEMO_USER` | no | `false` | Set `true` to create demo user on `npm run seed` |
| `LOG_LEVEL` | no | `info` | pino log level |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | Dev CORS origin |

---

## Deployment (Render + Atlas)

### MongoDB Atlas Setup
1. Create a free M0 cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user (username + password)
3. Under Network Access, add `0.0.0.0/0` (Render uses dynamic IPs)
4. Copy the connection string → `MONGODB_URI`

### Render Web Service
- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/api/health`
- **Environment variables:** All from the table above, with:
  - `NODE_ENV=production`
  - `COOKIE_SECURE=true`
  - Strong random `JWT_SECRET`

### Cold Starts
Render free instances spin down after 15 minutes of inactivity. Recommend setting up [UptimeRobot](https://uptimerobot.com) to ping `/api/health` every 5 minutes during evaluation.

### Deployed URL
> _Add your Render URL here after deployment_

---

## Demo Credentials

Register a new account, or if `SEED_DEMO_USER=true` was run on your deployment:
- **Email:** `demo@example.com`
- **Password:** `Demo1234`

---

## Design Decisions

### Integer Paise Money
All prices, costs, and balances are stored as integers in paise (1 INR = 100 paise). Floats are never stored or used in calculations — only formatted at the UI boundary with `Intl.NumberFormat('en-IN')`. This eliminates floating-point rounding errors in cumulative P&L calculations.

### Transactional Fills with Conditional Updates
Every fill uses `mongoose.startSession().withTransaction()`. The critical claim step is `Order.findOneAndUpdate({_id, status:'PENDING'}, {...FILLED})` — if it returns null, the order was already claimed by another concurrent operation, and the transaction aborts with no side effects. This prevents double fills under concurrent requests.

### Reservation of Funds and Shares
BUY limit orders reserve `limitPrice × qty` from `cashPaise` into `reservedCashPaise` at placement. SELL limit orders reserve shares into `reservedQty`. This guarantees that pending orders can never overspend, even before filling. Fill price improvement (tick < limit) releases more reserved cash than spent.

### Idempotency Keys
Every order placement requires a client-generated `Idempotency-Key` header. The server stores `(userId, idempotencyKey)` as a unique index. Retries return the original order without side effects. Concurrent duplicate inserts are handled via the E11000 duplicate-key error path.

### Virtual Clock and Determinism
The virtual clock is a pure function of wall time. It does not store state. Every process (server restart, different timezone) computes the same virtual time given the same wall clock. DEMO_REPLAY loops a completed session indefinitely using `(wallMs × speed) mod SESSION_MS`. This means the app is never frozen — there is always a live, moving price feed.

### Replay Instead of a Live Feed
Yahoo Finance blocks or rate-limits programmatic access. Replaying committed candles guarantees the app works offline, on weekends, and on hosting providers that are blocked by Yahoo. The 15-minute delay during live hours is an NSE-mandated minimum for non-subscribers.

### Fallback Chain and Circuit Breaker
`candleStore.js` tries: MongoDB → committed snapshot JSON (loaded at boot, committed to git) → synthetic seeded random walk. The circuit breaker wraps Yahoo calls: CLOSED (normal) → OPEN after 5 consecutive failures → HALF_OPEN after exponential backoff (30s, 60s, … up to 10 min). One failed symbol never crashes the ingest loop.

### Session-Restart Matching Guard
When `sessionEpoch` changes (session loop wrap or mode switch), the matcher skips the **first tick** of the new epoch for all symbols. This prevents fills caused by the artificial price jump between one session's close and the next open, which would not represent a genuine market crossing.

### Fill-Price Rule
Limit orders fill at the **triggering tick's price** (always equal to or better than the limit). Market orders fill at the latest tick. This is documented in the order ticket and means BUY limits get price improvement when the tick is below the limit, and SELL limits when the tick is above.

### Single-Instance Matcher
The in-memory matcher works correctly on a single process. Horizontal scaling (multiple instances) would require moving the matcher to a leader-elected worker or a message queue. This is documented as a known limitation.

---

## Testing

```bash
npm test    # runs all 94 tests
```

**Unit tests** (Vitest): clock `getMode`/`getVirtualTime`, tick generator determinism and bounds, candle aggregation, circuit breaker state machine, money helpers.

**Engine integration tests** (Vitest + MongoMemoryReplSet): market BUY/SELL fills, weighted average cost, insufficient funds/shares, reserved funds, double-fill prevention via concurrent `executeFill`, cancel-vs-fill race, transaction rollback, idempotency, session-restart guard, restart recovery.

**API tests** (Supertest): auth flow, cookie flags, validation errors, missing idempotency key, unauthenticated 401, health endpoint.

---

## Known Limitations and Future Work

- **GTC orders only** — no intraday "day orders" (cancel at 15:30)
- **No fees or taxes** — STT, brokerage, and GST not simulated
- **Single replay speed** — no runtime speed control (env variable only)
- **No corporate actions** — dividends, splits, and bonuses not handled
- **Single-instance matcher** — horizontal scaling requires a queue or leader election
- **Yahoo Finance dependency** — unofficial API, subject to rate limiting; committed snapshots mitigate this
- **No L2 order book** — all fills at a single price, no bid/ask spread simulation
- **Mobile layout** — functional but not fully optimised for small screens

---

## Disclaimer

**TradeVirtual is a simulation for educational purposes only.** All prices are derived from historical or synthetically generated data and are for learning purposes only. No real money is involved. This is not financial advice. Past simulated performance does not predict real market outcomes.

Price data sourced from Yahoo Finance via `yahoo-finance2` — an unofficial, community-maintained library. Data may be inaccurate, delayed, or unavailable.

---

## Credits

- **Yahoo Finance data** via [`yahoo-finance2`](https://github.com/gadicc/node-yahoo-finance2) (unofficial, delayed)
- [`lightweight-charts`](https://github.com/tradingview/lightweight-charts) by TradingView (Apache 2.0)
- [`mongodb-memory-server`](https://github.com/nodkz/mongodb-memory-server) for test replica set
- All other open-source dependencies listed in `package.json`

## AI Usage Transparency

This project was developed with the assistance of AI coding tools (Google Antigravity / Gemini) for scaffolding, code generation, and debugging. All architectural decisions, business logic design, and test case specifications were human-authored. All generated code was reviewed, tested, and verified before commit.
