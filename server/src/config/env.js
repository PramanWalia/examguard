import 'dotenv/config';

import { z } from 'zod';

const boolean = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const DEFAULT_ACCESS_SECRET = 'dev-only-access-secret-change-me-000000';
const DEFAULT_REFRESH_SECRET = 'dev-only-refresh-secret-change-me-0000';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).default(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  REPOSITORY_DRIVER: z.enum(['memory', 'mongo']).default('memory'),
  MONGODB_URI: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32).default(DEFAULT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEFAULT_REFRESH_SECRET),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  IMPORT_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  SEED_ON_START: boolean('false'),
  TRUST_PROXY: boolean('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
}

if (
  parsed.data.NODE_ENV === 'production' &&
  (!process.env.JWT_ACCESS_SECRET ||
    !process.env.JWT_REFRESH_SECRET ||
    parsed.data.JWT_ACCESS_SECRET === DEFAULT_ACCESS_SECRET ||
    parsed.data.JWT_REFRESH_SECRET === DEFAULT_REFRESH_SECRET)
) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be unique, strong secrets in production.');
}

export const config = Object.freeze(parsed.data);

export const allowedOrigins = Object.freeze(
  config.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
