/**
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { env } from '../config/env.js';
import { DomainError } from '../engine/errors.js';

export const authRouter = Router();

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    email: z.string().email('Must be a valid email'),
    name: z.string().trim().min(1).max(60),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-zA-Z]/, 'Password must contain a letter')
      .regex(/[0-9]/, 'Password must contain a number'),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

// ── POST /api/auth/register ───────────────────────────────────────────────────

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid registration data', {
        details: parsed.error.flatten(),
        status: 400,
      });
    }

    const { email, name, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await User.create({
        email: normalizedEmail,
        name,
        passwordHash,
        cashPaise: env.STARTING_CASH_PAISE,
        startingCashPaise: env.STARTING_CASH_PAISE,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate email — return generic message
        throw new DomainError('DUPLICATE_REQUEST', 'An account with that email already exists', {
          status: 409,
        });
      }
      throw err;
    }

    const token = signToken(String(user._id));
    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        cashPaise: user.cashPaise,
        startingCashPaise: user.startingCashPaise,
        createdAt: user.createdAt,
      },
    });
  }),
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 'Invalid login data', {
        details: parsed.error.flatten(),
        status: 400,
      });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Constant-time: always fetch (even if not found) then compare
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    const DUMMY_HASH = '$2b$12$invalidhashfortimingnoleak0000000000000000000';
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;

    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      throw new DomainError('UNAUTHENTICATED', 'Invalid email or password', { status: 401 });
    }

    const token = signToken(String(user._id));
    setAuthCookie(res, token);

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        cashPaise: user.cashPaise,
        startingCashPaise: user.startingCashPaise,
        createdAt: user.createdAt,
      },
    });
  }),
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  }),
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) {
      throw new DomainError('UNAUTHENTICATED', 'User not found', { status: 401 });
    }
    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        cashPaise: user.cashPaise,
        reservedCashPaise: user.reservedCashPaise,
        startingCashPaise: user.startingCashPaise,
        createdAt: user.createdAt,
      },
    });
  }),
);
