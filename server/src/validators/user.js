import { z } from 'zod';

import { batchId, paginationFields } from './common.js';

export const userPatchSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be 2–80 characters.').max(80, 'Name must be 2–80 characters.').optional(),
    role: z.enum(['admin', 'teacher', 'student']).optional(),
    batchIds: z
      .array(batchId)
      .max(50)
      .refine((values) => new Set(values).size === values.length, 'Batch ids must be unique.')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field.');

export const userListQuerySchema = z
  .object({
    role: z.enum(['admin', 'teacher', 'student']).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    batch: batchId.optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    ...paginationFields,
  })
  .strict();
