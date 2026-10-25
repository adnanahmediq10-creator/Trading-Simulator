/**
 * portfolio.js — compute the portfolio summary for a user.
 * All prices in paise. Unrealised P&L uses latest tick prices.
 */
import { User } from '../models/User.js';
import { Position } from '../models/Position.js';
import { INSTRUMENTS, getInstrument } from '../config/instruments.js';

/**
 * @param {string} userId
 * @param {import('../market/priceService.js').PriceService} priceService
 * @returns {Promise<object>}
 */
export async function getPortfolio(userId, priceService) {
  const [user, positions] = await Promise.all([
    User.findById(userId),
    Position.find({ userId }).lean(),
  ]);

  if (!user) throw new Error('User not found');

  const buyingPowerPaise = user.cashPaise - user.reservedCashPaise;

  const enrichedPositions = positions
    .filter((p) => p.qty > 0 || p.realizedPnlPaise !== 0) // hide zero-qty / zero-pnl rows from display
    .map((pos) => {
      const inst = getInstrument(pos.symbol);
      const tick = priceService?.getLatest(pos.symbol);
      const priceStale = !tick || priceService?.isStale(pos.symbol);
      const ltpPaise = tick?.pricePaise ?? pos.avgCostPaise;
      const prevClosePaise = tick?.prevClosePaise ?? ltpPaise;

      const marketValuePaise = ltpPaise * pos.qty;
      const unrealizedPnlPaise = (ltpPaise - pos.avgCostPaise) * pos.qty;
      const unrealizedPct =
        pos.qty > 0 && pos.avgCostPaise > 0
          ? Math.round((unrealizedPnlPaise / (pos.avgCostPaise * pos.qty)) * 10000) / 100
          : 0;
      const dayChangePaise = (ltpPaise - prevClosePaise) * pos.qty;

      return {
        symbol: pos.symbol,
        name: inst?.name ?? pos.symbol,
        qty: pos.qty,
        reservedQty: pos.reservedQty,
        avgCostPaise: pos.avgCostPaise,
        ltpPaise,
        priceStale,
        marketValuePaise,
        unrealizedPnlPaise,
        unrealizedPct,
        realizedPnlPaise: pos.realizedPnlPaise,
        dayChangePaise,
      };
    });

  const totalMarketValue = enrichedPositions.reduce((s, p) => s + p.marketValuePaise, 0);
  const totalUnrealized = enrichedPositions.reduce((s, p) => s + p.unrealizedPnlPaise, 0);
  const totalRealized = enrichedPositions.reduce((s, p) => s + p.realizedPnlPaise, 0);
  const equityPaise = user.cashPaise + totalMarketValue;
  const totalPnlPaise = totalUnrealized + totalRealized;
  const totalPnlPct =
    user.startingCashPaise > 0
      ? Math.round((totalPnlPaise / user.startingCashPaise) * 10000) / 100
      : 0;

  return {
    cashPaise: user.cashPaise,
    reservedCashPaise: user.reservedCashPaise,
    buyingPowerPaise,
    startingCashPaise: user.startingCashPaise,
    positions: enrichedPositions,
    totals: {
      marketValuePaise: totalMarketValue,
      equityPaise,
      unrealizedPnlPaise: totalUnrealized,
      realizedPnlPaise: totalRealized,
      totalPnlPaise,
      totalPnlPct,
    },
  };
}
