import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const DEFAULT_ACCESS_SECRET = 'dev-access-secret-change-me-1234567890';
export const DEFAULT_REFRESH_SECRET = 'dev-refresh-secret-change-me-1234567890';

const booleanFromEnv = (defaultValue = false) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      if (val === undefined || val === '') return defaultValue;
      return val === 'true' || val === '1';
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).default(4000),
  REPOSITORY_DRIVER: z.enum(['memory', 'mongo']).default('memory'),
  MONGODB_URI: z.string().trim().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(16).default(DEFAULT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(16).default(DEFAULT_REFRESH_SECRET),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  CORS_ORIGIN: z.string().optional().default(''),
  COOKIE_SECURE: booleanFromEnv(false),
  TRUST_PROXY: booleanFromEnv(false),
  SEED_ON_START: booleanFromEnv(false),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  IMPORT_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  TEACHER_INVITE_CODE: z.string().trim().optional().default(''),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(90),
  MAX_ANSWER_GAP_SECONDS: z.coerce.number().int().positive().default(300),
});

export const validateEnv = (rawEnv = process.env) => {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  if (data.NODE_ENV === 'test' && rawEnv.BCRYPT_ROUNDS === undefined) {
    data.BCRYPT_ROUNDS = 4;
  }

  if (data.NODE_ENV === 'production') {
    if (data.SEED_ON_START) {
      throw new Error('SEED_ON_START=true is not allowed when NODE_ENV=production.');
    }
    if (data.REPOSITORY_DRIVER !== 'mongo') {
      throw new Error('REPOSITORY_DRIVER=mongo is required when NODE_ENV=production.');
    }
    if (!data.MONGODB_URI) {
      throw new Error('MONGODB_URI is required when NODE_ENV=production.');
    }
    if (
      data.JWT_ACCESS_SECRET === DEFAULT_ACCESS_SECRET ||
      data.JWT_REFRESH_SECRET === DEFAULT_REFRESH_SECRET
    ) {
      throw new Error('Production environment requires explicit non-default JWT secrets.');
    }
  }

  return data;
};

export const config = validateEnv(process.env);

export const allowedOrigins = [
  ...config.CLIENT_ORIGIN.split(','),
  ...config.CORS_ORIGIN.split(','),
]
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
