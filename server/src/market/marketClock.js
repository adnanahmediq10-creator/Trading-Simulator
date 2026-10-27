/**
 * Resolve the market clock shared by REST responses and the tick broadcaster.
 * During live-data outages the price service can switch to demo replay; using
 * its clock keeps candles aligned with the ticks that update them in clients.
 */
import { getHolidays, getEffectiveMode, getVirtualTime } from './clock.js';
import { priceService } from './priceService.js';
import { env } from '../config/env.js';

export function getMarketClock(nowMs = Date.now()) {
  const activeState = priceService.getMarketState();
  if (activeState) return activeState;

  const hasLiveData = Object.values(priceService.getDataSources()).some(
    (source) => source === 'db',
  );
  const modeInfo = getEffectiveMode(nowMs, getHolidays(), hasLiveData);
  const effectiveMode = modeInfo.effectiveMode ?? modeInfo.mode;
  const virtualTime = getVirtualTime(
    nowMs,
    { ...modeInfo, mode: effectiveMode },
    env.REPLAY_SPEED,
  );

  return {
    ...modeInfo,
    ...virtualTime,
    effectiveMode,
    speed: env.REPLAY_SPEED,
  };
}
