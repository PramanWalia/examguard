import { z } from 'zod';

import { batchId, isoDate, objectId, paginationFields } from './common.js';

const settingsSchema = z
  .object({
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    partialMarking: z.boolean(),
    passPercentage: z.number().min(0).max(100),
    violationLimit: z.number().int().min(0).max(1000),
    autoSubmitOnViolation: z.boolean(),
    maxAttempts: z.number().int().min(1).max(10),
    numericTolerance: z.number().min(0),
  })
  .partial()
  .strict();

const assignmentSchema = z
  .object({
    batchIds: z
      .array(batchId)
      .max(50, 'At most 50 batches.')
      .refine((values) => new Set(values).size === values.length, 'Batch ids must be unique.'),
    joinCodeEnabled: z.boolean(),
  })
  .partial()
  .strict();

const itemSchema = z
  .object({
    questionId: objectId,
    marks: z.number().min(0, 'Marks must be 0–100.').max(100, 'Marks must be 0–100.'),
    negativeMarks: z.number().min(0, 'Negative marks must be 0–100.').max(100, 'Negative marks must be 0–100.').default(0),
  })
  .strict()
  .refine((item) => item.negativeMarks <= item.marks, {
    path: ['negativeMarks'],
    message: 'Negative marks cannot exceed marks.',
  });

const examFields = z.object({
  title: z.string().trim().min(3, 'Title must be 3–150 characters.').max(150, 'Title must be 3–150 characters.'),
  description: z.string().trim().max(2000, 'Description is limited to 2000 characters.').default(''),
  durationMinutes: z
    .number()
    .int('Duration must be a whole number.')
    .min(1, 'Duration must be 1–480 minutes.')
    .max(480, 'Duration must be 1–480 minutes.'),
  startAt: isoDate,
  endAt: isoDate,
  resultMode: z.enum(['immediate', 'after_end', 'manual']).default('after_end'),
  settings: settingsSchema.default({}),
  assignment: assignmentSchema.default({}),
  items: z.array(itemSchema).max(200, 'At most 200 items.').default([]),
});

const examRules = (body, context) => {
  if (new Date(body.startAt).getTime() >= new Date(body.endAt).getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: 'End time must be after start time.',
    });
  }
  if (new Date(body.endAt).getTime() <= Date.now()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: 'End time must be in the future.',
    });
  }
};

export const examSchema = examFields.strict().superRefine(examRules);
export const examScheduleSchema = z
  .object({ startAt: isoDate, endAt: isoDate })
  .strict()
  .superRefine(examRules);

export const examPatchSchema = examFields.partial().strict();

export const examListQuerySchema = z
  .object({
    status: z.enum(['draft', 'published']).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    ...paginationFields,
  })
  .strict();

export const availableQuerySchema = z
  .object({
    scope: z.enum(['upcoming', 'live', 'past', 'all']).default('all'),
    ...paginationFields,
  })
  .strict();

export const joinSchema = z
  .object({
    joinCode: z
      .string()
      .trim()
      .min(4, 'Enter a valid join code.')
      .max(32, 'Enter a valid join code.')
      .regex(/^[A-Za-z0-9-]+$/, 'Enter a valid join code.'),
  })
  .strict();

export const monitorQuerySchema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'submitted']).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    ...paginationFields,
  })
  .strict();

export const resultsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    ...paginationFields,
  })
  .strict();
