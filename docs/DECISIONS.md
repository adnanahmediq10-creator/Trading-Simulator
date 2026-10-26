# Design Decisions Log

## 2026-10-25 — Yahoo Finance probe (M1)

- **Library:** `yahoo-finance2@2.13.x` (v2). Spec requires v2 for ingest scripts.
- **Rate limits:** From this dev environment, all `chart()` calls returned HTTP 429 (`Too Many Requests`) even with long delays between symbols. Probe script classifies that as `RATE_LIMIT`.
- **1m history:** Could not empirically verify 7-day 1m depth while rate-limited. Snapshot script requests one session per day via `period1`/`period2` aligned to NSE 09:15–15:30 IST (375 minutes).
- **Index volume:** Not verified live; indices often report zero volume on Yahoo — UI treats volume as optional for indices.
- **Committed snapshot:** `npm run snapshot` fell back to **synthetic** sessions (seeded random walk, 375×1m + 252×1d) because Yahoo was unavailable. Re-run `npm run snapshot` from a network that Yahoo accepts to replace JSON with real candles before final submission.

## 2026-10-25 — Money representation

- **Decision:** All prices, costs, P&L, and balances are integers in paise (1 INR = 100 paise).
- **Rationale:** Eliminates floating-point rounding errors in cumulative P&L and weighted average cost calculations. `Number.isSafeInteger` guards catch accidental float leakage at engine boundaries. Floats are only introduced at the UI display layer via `Intl.NumberFormat`.

## 2026-10-25 — bcryptjs over bcrypt

- **Decision:** Use `bcryptjs` (pure-JS) instead of `bcrypt` (native).
- **Rationale:** Avoids native build failures on Render's build environment. Cost factor 10 is sufficient for the scale; spec explicitly recommends `bcryptjs`.

## 2026-10-25 — Replay mode and determinism

- **Decision:** `getVirtualTime` is a pure function of wall time; no stored state.
- **Rationale:** Makes every process restart and every client produce exactly the same virtual time. The session loops via modular arithmetic — `offset = (wallMs × speed) mod SESSION_MS` — so the app is never frozen. A stateless clock also makes unit testing trivial (just inject `nowMs`).

## 2026-10-25 — Tick generator PRNG (mulberry32)

- **Decision:** Use `mulberry32` seeded from `cyrb53(symbol + ':' + candle.t)`.
- **Rationale:** Fast, small, and produces good uniformity. The seed is deterministic across restarts so every client at the same virtual second sees the same tick. Seeding from `symbol + candle.t` means different symbols and different sessions get independent noise streams.

## 2026-10-25 — Fill-price rule: tick price, not limit price

- **Decision:** Limit orders fill at the triggering tick's price, not the limit price.
- **Rationale:** Price improvement is realistic (NSE fills execute at the best available price, not necessarily the limit). A BUY limit at ₹100 that triggers when the tick is ₹98 fills at ₹98, charging less than reserved — the reservation release path handles this correctly.

## 2026-10-25 — Double-fill prevention

- **Decision:** `executeFill` claims the order with `findOneAndUpdate({_id, status:'PENDING'}, {...FILLED})`. If it returns null, the transaction aborts silently.
- **Rationale:** A single conditional atomic update prevents double fills under concurrent ticks or concurrent HTTP calls without any application-level locking. MongoDB guarantees the update is atomic at the document level.

## 2026-10-25 — Session-restart matching guard

- **Decision:** The matcher skips the first tick after `session-restart` for all symbols.
- **Rationale:** When the virtual session loops or the mode switches, the price can jump discontinuously (e.g., session-close price → next-session-open price). Processing fills on that jump tick would be spurious — a BUY limit set above today's close would fill on the artificial jump, not a genuine market crossing.

## 2026-10-25 — Single-instance matcher

- **Decision:** The matcher is an in-memory singleton, rebuilt from MongoDB at boot.
- **Rationale:** Sufficient for the project scope. For horizontal scaling, the matcher would need to move to a leader-elected worker process or a message queue (e.g., Redis Streams). This is documented in README Known Limitations.

## 2026-10-25 — Circuit breaker parameters

- **Decision:** OPEN after 5 consecutive Yahoo failures; HALF_OPEN after exponential backoff (30s, 60s, 120s, … capped at 600s). A single probe request in HALF_OPEN; success → CLOSED.
- **Rationale:** 5 failures before opening gives tolerance for transient errors. Exponential backoff prevents hammering a blocked endpoint. The 10-min cap ensures the app will check again within a reasonable time if Yahoo comes back.

## 2026-10-25 — Cookie auth, same-origin, no CORS in production

- **Decision:** JWT in httpOnly `SameSite=Lax` cookie; Express serves the built React app from `client/dist`; Socket.IO on the same origin.
- **Rationale:** Eliminates CORS pre-flight overhead, cross-site cookie issues, and the need to expose tokens to JavaScript. Origin-check middleware provides CSRF protection for state-changing requests.

## 2026-10-26 — `@import "tailwindcss"` (Tailwind v4 syntax)

- **Decision:** Use `@import "tailwindcss"` in `index.css` (Tailwind v4 CDN-style via PostCSS).
- **Rationale:** Tailwind CSS v4 ships as a single PostCSS plugin (`@tailwindcss/postcss`). The `@import` directive replaces the v3 `@tailwind base/components/utilities` directives.

## 2026-10-26 — Trades endpoint at `/api/trades` (re-routed from ordersRouter)

- **Decision:** Mount `ordersRouter` at both `/api/orders` and `/api/trades`. The `GET /trades` route inside ordersRouter handles `/api/trades`.
- **Rationale:** Avoids duplicating auth middleware. The `requireAuth` at the top of `ordersRouter` covers both endpoints.
