# Design decisions log

## 2026-10-25 — Yahoo Finance probe (M1)

- **Library:** `yahoo-finance2@2.14.x` (v2) prints an EOL warning; spec requires v2 for ingest scripts. Stay on v2 until post-deadline migration.
- **Rate limits:** From this dev environment, all `chart()` calls returned HTTP 429 (`Too Many Requests`) even with long delays between symbols. Probe script classifies that as `RATE_LIMIT`.
- **1m history:** Could not empirically verify 7-day 1m depth while rate-limited. Snapshot script requests one session per day via `period1`/`period2` aligned to NSE 09:15–15:30 IST (375 minutes).
- **Index volume:** Not verified live; indices often report zero volume on Yahoo — UI treats volume as optional for indices.
- **Committed snapshot:** `npm run snapshot` fell back to **synthetic** sessions (seeded random walk, 375×1m + 252×1d) because Yahoo was unavailable. Re-run `npm run snapshot` from a network that Yahoo accepts to replace JSON with real candles before final submission.
