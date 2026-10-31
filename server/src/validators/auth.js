import { z } from 'zod';

import { email } from './common.js';

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be 2–80 characters.').max(80, 'Name must be 2–80 characters.'),
    email,
    password: z
      .string()
      .min(8, 'Password must be 8–72 characters.')
      .max(72, 'Password must be 8–72 characters.'),
    role: z.enum(['student', 'teacher']).default('student'),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Enter your password.').max(72),
  })
  .strict();
