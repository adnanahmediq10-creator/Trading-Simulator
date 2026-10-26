/**
 * Socket.IO server setup.
 * - Authentication in io.use middleware (reads JWT from cookie)
 * - Authenticated sockets join room `user:<id>`
 * - Forwards price service `ticks` and `session-restart` events to all clients
 * - Sends `order:update` and `portfolio:update` to user-private rooms
 *
 * The server accepts NO mutating socket events — all writes go via REST.
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { env } from '../config/env.js';
import { priceService } from '../market/priceService.js';
import { logger } from '../utils/logger.js';

/** @type {Server} */
let io;

/**
 * Initialise Socket.IO on the given HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors:
      env.NODE_ENV === 'development'
        ? { origin: env.CLIENT_ORIGIN, credentials: true }
        : false,
    // Same-origin in production (no CORS needed)
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie ?? '';
    const cookies = parseCookie(cookieHeader);
    const token = cookies.token;

    if (token) {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET);
        socket.userId = payload.sub;
      } catch {
        // Invalid token — allow as anonymous
        socket.userId = null;
      }
    } else {
      socket.userId = null;
    }
    next();
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      logger.debug({ userId: socket.userId }, 'Authenticated socket connected');
    } else {
      logger.debug({ id: socket.id }, 'Anonymous socket connected');
    }

    socket.on('disconnect', () => {
      logger.debug({ id: socket.id, userId: socket.userId }, 'Socket disconnected');
    });

  });

  // ── Forward price service events to all sockets ────────────────────────────
  priceService.on('ticks', ({ ticks, status }) => {
    io.emit('ticks', { ticks, status });
  });

  priceService.on('session-restart', (data) => {
    io.emit('market:session-restart', data);
    logger.info({ sessionEpoch: data.sessionEpoch }, 'Emitted market:session-restart');
  });

  logger.info('Socket.IO initialised');
  return io;
}

export { io };
