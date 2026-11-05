import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import morgan from 'morgan';

import { allowedOrigins, config } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { createRepositoryFactory } from './repositories/index.js';
import { apiRouter } from './routes/index.js';
import { AppError } from './utils/errors.js';

/**
 * Build the Express app without listening, so Supertest and the server share
 * one wiring. Each call gets isolated in-memory repositories unless passed in.
 * Seeding is async (bcrypt), so callers seed before creating the app.
 */
export const createApp = ({ repos = createRepositoryFactory() } = {}) => {
  const app = express();
  app.locals.repos = repos;
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, '');
        const isAllowed =
          allowedOrigins.includes(cleanOrigin) ||
          cleanOrigin.endsWith('.vercel.app');
        if (isAllowed) return callback(null, true);
        return callback(new AppError(403, 'FORBIDDEN', 'Origin not allowed.'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  if (config.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', serverTime: new Date().toISOString() } });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.use('/api/v1', globalLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
