/**
 * GET  /api/portfolio  — full portfolio summary
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPortfolio } from '../engine/portfolio.js';
import { priceService } from '../market/priceService.js';

export const portfolioRouter = Router();
portfolioRouter.use(requireAuth);

portfolioRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const portfolio = await getPortfolio(req.userId, priceService);
    res.json(portfolio);
  }),
);
