import rateLimit from 'express-rate-limit';

import { config } from '../config/env.js';

const handler = (_req, res) => {
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
  });
};

const build = (limit) =>
  rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler,
    // Tests exercise business behaviour; hammering the limiter is covered by its own smoke test.
    skip: () => config.NODE_ENV === 'test',
  });

export const globalLimiter = build(config.RATE_LIMIT_MAX);
export const authLimiter = build(config.AUTH_RATE_LIMIT_MAX);
