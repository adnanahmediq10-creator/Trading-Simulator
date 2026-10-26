# Architecture — TradeVirtual

## System Diagram

```
Browser (React + Vite)
│
│  HTTP/REST (/api/*)          WebSocket (/socket.io)
│──────────────────────────────────────────────────►│
│                                                    │
│                      Express (Node 20)              │
│                      ┌─────────────────────────┐   │
│                      │ Routes (/api/*)          │   │
│                      │  auth, market, orders,   │   │
│                      │  portfolio, account,     │   │
│                      │  health                  │   │
│                      └──────────┬──────────────┘   │
│                                 │                   │
│                      ┌──────────▼──────────────┐   │
│                      │       Order Engine       │   │
│                      │  placeOrder             │   │
│                      │  executeFill (tx)       │   │
│                      │  cancelOrder (tx)       │   │
│                      │  matcher (in-memory)    │   │
│                      │  portfolio              │   │
│                      └──────────┬──────────────┘   │
│                                 │                   │
│                      ┌──────────▼──────────────┐   │
│                      │   Market / Price Layer   │   │
│                      │  clock.js (IST math)    │   │
│                      │  priceService (1 Hz)    │   │
│                      │  tickGenerator (pure)   │   │
│                      │  candleStore (fallback) │   │
│                      │  ingest.js (Yahoo+CB)   │   │
│                      │  synthetic.js           │   │
│                      └──────────┬──────────────┘   │
│                                 │                   │
│                      ┌──────────▼──────────────┐   │
│                      │  MongoDB Atlas (M0)      │   │
│                      │  Users, Orders, Trades, │   │
│                      │  Positions, Candles     │   │
│                      └─────────────────────────┘   │
│                                                    │
│◄───────────────────── Socket events ───────────────│
│  ticks (1 Hz, broadcast)                           │
│  market:session-restart (broadcast)                │
│  order:update (user room)                          │
│  portfolio:update (user room)                      │
```

## Component Descriptions

### Virtual Market Clock (`market/clock.js`)
Pure functions implementing IST timezone math without relying on server locale.
Returns the current mode (`DELAYED_LIVE` or `DEMO_REPLAY`), the session date,
and the virtual timestamp. Deterministic and stateless — any process at any wall
time produces the same virtual time.

**DELAYED_LIVE**: Mon–Fri non-holiday, 09:30–15:45 IST.  
Virtual time = wall time − 15 min. This streams real NSE 1m bars with a 15-minute delay.

**DEMO_REPLAY**: Weekends, holidays, and outside the live window.  
Virtual time = session open + `(wallMs × speed) mod SESSION_MS`.  
The session loops forever so the app is never idle.

### Price Service (`market/priceService.js`)
An EventEmitter with a 1 Hz `setInterval`. Each cycle:
1. Evaluates the clock mode.
2. Reads the relevant 1m candle for each of 12 symbols from an in-memory cache.
3. Runs `tickAt(symbol, candle, secIdx)` to produce a deterministic price.
4. Emits a `ticks` batch to Socket.IO (broadcast to all clients).
5. Signals `session-restart` when the session epoch changes.

The ticker loop is protected by try/catch per symbol so one bad symbol never
stops the feed.

### Tick Generator (`market/tickGenerator.js`)
Pure, deterministic function: `tickAt(symbol, candle, secIdx) -> pricePaise`.
Uses `mulberry32` PRNG seeded from `symbol + ':' + candle.t`. Interpolates four
waypoints (open, firstExtreme, secondExtreme, close) with deterministic noise,
clamps to [low, high], and snaps to 5-paise multiples. Same seed always gives
the same sequence — every client and every server restart sees identical prices.

### Candle Store (`market/candleStore.js`)
Three-level fallback for `getSession(symbol, date)`:
1. **MongoDB** (populated by the ingest job).
2. **Committed snapshot JSON** (loaded at boot, always available offline).
3. **Synthetic session** (seeded geometric random walk, 375 candles).

Returns `{ candles, source: 'db' | 'snapshot' | 'synthetic' }`.
The source is surfaced in the status bar and `/api/health`.

### Ingest Job (`market/ingest.js`)
Runs at boot and checks every 2 minutes. It refreshes 1m candles only during
`DELAYED_LIVE` and downloads daily history at most once per IST calendar day.
Fresh intraday candles are reloaded into the price service after ingest. Yahoo
requests are upserted to MongoDB and wrapped in a circuit breaker
(CLOSED → OPEN after 5 consecutive failures → HALF_OPEN after exponential backoff).
Never blocks the main request path — failures fall through to the candle store.

### Order Engine
All write paths use `mongoose.startSession().withTransaction()` so every fill is
atomic. Conditional `$inc` guards (e.g., `cash - reserved >= cost`) prevent race
conditions without application-level locking.

- **`placeOrder`**: validates input, checks idempotency, reads the latest tick,
  reserves funds/shares, and creates the order document.
- **`executeFill`**: claims the order with a single `findOneAndUpdate` (prevents
  double fills), updates cash/position/trades in one transaction.
- **`cancelOrder`**: releases reservations atomically.
- **`matcher`**: in-memory index rebuilt from MongoDB at boot. Subscribes to the
  price service `ticks` event. Processes each symbol through a sequential promise
  queue so concurrent ticks for the same symbol never cause double fills.

### Auth & Security
JWT in an httpOnly `SameSite=Lax` cookie. Origin check middleware rejects
state-changing requests whose `Origin` header does not match the app origin.
All user-scoped queries are filtered by `userId` from the token, never from
client input.

### Socket Layer (`sockets/index.js`)
Socket.IO on the same HTTP server. Auth middleware parses the cookie and verifies
the JWT. Authenticated sockets join a private room `user:<id>`. Market data is
broadcast to everyone; `order:update` and `portfolio:update` go to the user room only.

## Data Flow: Placing a Market BUY Order

```
Client submits POST /api/orders
   → requireAuth verifies cookie → userId
   → orderLimiter (30/min per user)
   → placeOrder():
       1. Zod validation
       2. Idempotency check (unique index on userId+key)
       3. priceService.getLatest(symbol) → check staleness
       4. BEGIN TRANSACTION
          $inc cashPaise -= cost (conditional: cash-reserved >= cost)
          insertOne Order {status: FILLED, filledPricePaise: tick}
          upsert Position (weighted avg cost)
          insertOne Trade
       5. COMMIT
       6. io.to('user:id').emit('order:update', order)
       7. io.to('user:id').emit('portfolio:update')
   → 201 { order }
```

## Data Flow: Limit Order Fill (via Matcher)

```
priceService emits 'ticks' every second
   → matcher.onTick(symbol, tickPrice, vts)
      per-symbol promise queue (sequential)
      for each PENDING LIMIT in time priority:
         BUY: fill if tickPrice <= limitPrice
         SELL: fill if tickPrice >= limitPrice
         → executeFill(orderId, tickPrice, vts)
            BEGIN TRANSACTION
            findOneAndUpdate {_id, status:'PENDING'} → {FILLED}  ← atomic claim
            update cash / position / realised P&L
            insert Trade
            COMMIT
         → emit order:update, portfolio:update to user room
```

## Invariants
- `cashPaise >= 0` at all times (enforced by conditional updates).
- `reservedCashPaise <= cashPaise` (reserved is subset of cash).
- `reservedQty <= qty` per position.
- All money stored as integer paise. Float conversion only at UI display.
- One `executeFill` claim per order (the atomic `{_id, status:'PENDING'}` guard
  ensures exactly one winner even under concurrent calls).
