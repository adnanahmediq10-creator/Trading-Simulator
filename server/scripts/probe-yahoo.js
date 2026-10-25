/**
 * Yahoo Finance connectivity probe for all configured instruments.
 * Run: npm run probe -w server
 */
import yahooFinance from 'yahoo-finance2';
import { INSTRUMENTS } from '../src/config/instruments.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateString(ms = Date.now()) {
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

/** Last weekday on or before today (IST). */
function prevWeekdayDateStr(fromMs = Date.now()) {
  let ms = istMidnightMs(istDateString(fromMs));
  for (let i = 0; i < 10; i++) {
    const dow = new Date(ms + IST_OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return istDateString(ms);
    }
    ms -= 24 * 60 * 60 * 1000;
  }
  return istDateString(fromMs);
}

function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('429') || lower.includes('rate') || lower.includes('too many')) {
    return 'RATE_LIMIT';
  }
  if (lower.includes('403') || lower.includes('blocked') || lower.includes('crumb')) {
    return 'BLOCKED';
  }
  return 'ERROR';
}

async function fetchChart(yahoo, period1, period2, interval) {
  return yahooFinance.chart(yahoo, {
    period1,
    period2,
    interval,
    includePrePost: false,
  });
}

function summarizeCandles(quotes) {
  const valid = quotes.filter((q) => q.close != null);
  if (valid.length === 0) {
    return { count: 0, first: null, last: null, lastClose: null, volumeZero: true };
  }
  const first = valid[0];
  const last = valid[valid.length - 1];
  const volSum = valid.reduce((s, q) => s + (q.volume ?? 0), 0);
  return {
    count: valid.length,
    first: first.date?.toISOString?.() ?? String(first.date),
    last: last.date?.toISOString?.() ?? String(last.date),
    lastClose: last.close,
    volumeZero: volSum === 0,
  };
}

async function main() {
  const sessionDate = prevWeekdayDateStr();
  const period1 = new Date(istMidnightMs(sessionDate));
  const period2 = new Date(istMidnightMs(sessionDate) + 24 * 60 * 60 * 1000);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  console.log(`Probe session date (IST): ${sessionDate}\n`);
  console.log(
    'symbol'.padEnd(14),
    'yahoo'.padEnd(16),
    '1m'.padEnd(8),
    '1m cnt',
    'last close',
    'vol0?',
    '1d cnt',
    'notes',
  );
  console.log('-'.repeat(100));

  for (const inst of INSTRUMENTS) {
    let note1m = '';
    let note1d = '';
    let s1m = { count: 0, lastClose: null, volumeZero: true };
    let s1d = { count: 0 };

    try {
      const r1m = await fetchChart(inst.yahoo, period1, period2, '1m');
      s1m = summarizeCandles(r1m.quotes ?? []);
      if (s1m.count > 0 && s1m.count < 300) {
        note1m = 'partial session';
      }
    } catch (err) {
      note1m = classifyError(err);
    }

    await new Promise((r) => setTimeout(r, 400));

    try {
      const r1d = await fetchChart(inst.yahoo, yearAgo, new Date(), '1d');
      s1d = summarizeCandles(r1d.quotes ?? []);
    } catch (err) {
      note1d = classifyError(err);
    }

    const ok1m = s1m.count > 0 ? 'OK' : 'FAIL';
    console.log(
      inst.symbol.padEnd(14),
      inst.yahoo.padEnd(16),
      ok1m.padEnd(8),
      String(s1m.count).padEnd(6),
      s1m.lastClose != null ? String(s1m.lastClose).padEnd(12) : '—'.padEnd(12),
      (s1m.volumeZero ? 'yes' : 'no').padEnd(6),
      String(s1d.count).padEnd(6),
      [note1m, note1d].filter(Boolean).join('; ') || '—',
    );

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('\nDone. Record empirical findings in docs/DECISIONS.md.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
