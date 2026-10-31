import { z } from 'zod';

import { badRequest } from '../utils/errors.js';

export const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export const objectId = z
  .string()
  .trim()
  .regex(OBJECT_ID_PATTERN, 'Must be a valid 24-character id.');

export const batchId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Must be an opaque batch slug such as CSE-A.');

export const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Must be a valid ISO date.')
  .transform((value) => new Date(value).toISOString());

export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

export const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const uniqueArray = (schema) =>
  z
    .array(schema)
    .refine((values) => new Set(values).size === values.length, 'Values must be unique.');

export const paramsWithId = z.object({ id: objectId }).strict();

/** Normalize zod issues to the contract's { path, message } details. */
export const zodDetails = (error) =>
  error.issues.flatMap((issue) =>
    // `.strict()` reports every unknown key in one issue; clients render per-field.
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({
          path: [...issue.path, key].join('.') || key,
          message: `Unknown field: ${key}`,
        }))
      : [{ path: issue.path.join('.') || 'body', message: issue.message }],
  );

/**
 * Validate a value outside express (e.g. after merging a PATCH into an entity)
 * and convert Zod failures into the contract's 400 envelope.
 */
export const parseInput = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw badRequest('One or more fields are invalid.', zodDetails(result.error));
  return result.data;
};
