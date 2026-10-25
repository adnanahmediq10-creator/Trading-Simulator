/**
 * Writes server/data/snapshot/<SYMBOL>.json from Yahoo or synthetic fallback.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yahooFinance from 'yahoo-finance2';
import { INSTRUMENTS } from '../src/config/instruments.js';
import { generateDaily, generateSession, sessionOpenMs } from '../src/market/synthetic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../data/snapshot');
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SESSION_MS = 375 * 60_000;
const MIN_CANDLES = 300;

function istDateString(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function istMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

function prevTradingDay(dateStr) {
  let ms = istMidnightMs(dateStr) - 24 * 60 * 60 * 1000;
  for (let i = 0; i < 14; i++) {
    const dow = new Date(ms + IST_OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return istDateString(ms);
    }
    ms -= 24 * 60 * 60 * 1000;
  }
  return dateStr;
}

function lastCompletedSessions(count, fromDateStr) {
  const sessions = [];
  let d = fromDateStr;
  while (sessions.length < count) {
    const dow = new Date(istMidnightMs(d) + IST_OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      sessions.push(d);
    }
    d = prevTradingDay(d);
  }
  return sessions;
}

function toPaise(price) {
  return Math.round(price * 100);
}

function mapQuotes(quotes) {
  return quotes
    .filter((q) => q.close != null && q.open != null)
    .map((q) => ({
      t: q.date.getTime(),
      o: toPaise(q.open),
      h: toPaise(q.high),
      l: toPaise(q.low),
      c: toPaise(q.close),
      v: Math.round(q.volume ?? 0),
    }));
}

async function fetchSessionYahoo(yahoo, sessionDate) {
  const period1 = new Date(sessionOpenMs(sessionDate));
  const period2 = new Date(sessionOpenMs(sessionDate) + SESSION_MS + 60_000);
  const result = await yahooFinance.chart(yahoo, {
    period1,
    period2,
    interval: '1m',
    includePrePost: false,
  });
  return mapQuotes(result.quotes ?? []);
}

async function fetchDailyYahoo(yahoo) {
  const period1 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart(yahoo, {
    period1,
    period2: new Date(),
    interval: '1d',
    includePrePost: false,
  });
  return mapQuotes(result.quotes ?? []);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const anchor = prevTradingDay(istDateString(Date.now()));
  const sessionDates = lastCompletedSessions(3, anchor);
  const summary = [];

  for (const inst of INSTRUMENTS) {
    let source = 'yahoo';
    const sessions = {};
    let daily = [];

    for (const sessionDate of sessionDates) {
      try {
        const candles = await fetchSessionYahoo(inst.yahoo, sessionDate);
        if (candles.length >= MIN_CANDLES) {
          sessions[sessionDate] = candles;
        } else {
          console.warn(`WARN ${inst.symbol} ${sessionDate}: only ${candles.length} 1m candles`);
        }
        await sleep(800);
      } catch {
        source = 'synthetic';
      }
    }

    try {
      daily = await fetchDailyYahoo(inst.yahoo);
      await sleep(800);
    } catch {
      source = 'synthetic';
    }

    if (source === 'synthetic' || Object.keys(sessions).length === 0) {
      source = 'synthetic';
      let seed = inst.basePricePaise;
      for (const sessionDate of [...sessionDates].reverse()) {
        const candles = generateSession(inst.symbol, sessionDate, seed);
        sessions[sessionDate] = candles;
        seed = candles[candles.length - 1].c;
      }
      daily = generateDaily(inst.symbol, inst.basePricePaise, 252);
    }

    const payload = {
      symbol: inst.symbol,
      yahoo: inst.yahoo,
      generatedAt: new Date().toISOString(),
      source,
      sessions,
      daily,
    };

    const outPath = path.join(OUT_DIR, `${inst.symbol}.json`);
    await fs.writeFile(outPath, JSON.stringify(payload, null, 0));

    const lastSession = sessionDates[0];
    const sc = sessions[lastSession] ?? [];
    summary.push({
      symbol: inst.symbol,
      source,
      sessionCandles: sc.length,
      dailyCandles: daily.length,
      lastClosePaise: sc.length ? sc[sc.length - 1].c : null,
    });
  }

  console.log('\nSnapshot summary:');
  console.table(summary);
  console.log(`\nWrote ${INSTRUMENTS.length} files to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
