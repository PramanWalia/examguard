import { z } from 'zod';

import { objectId } from './common.js';

export const answerSchema = z
  .object({
    itemId: objectId,
    selectedOptionIds: z
      .array(z.string().trim())
      .max(6, 'Provide at most 6 option ids.')
      .refine((values) => new Set(values).size === values.length, 'Option ids must be unique.')
      .optional(),
    numericValue: z.number().finite('Enter a finite number.').nullable().optional(),
    markedForReview: z.boolean().optional(),
    clientSeq: z
      .number()
      .int('clientSeq must be a non-negative integer.')
      .min(0, 'clientSeq must be a non-negative integer.'),
  })
  .strict()
  .refine(
    (body) =>
      body.selectedOptionIds !== undefined ||
      body.numericValue !== undefined ||
      body.markedForReview !== undefined,
    { path: ['answer'], message: 'Provide an answer or mark the question for review.' },
  );

export const violationSchema = z
  .object({
    type: z.enum([
      'tab_hidden',
      'window_blur',
      'fullscreen_exit',
      'copy',
      'paste',
      'context_menu',
      'shortcut',
      'heartbeat_missed',
      'long_answer_gap',
      'ip_change',
      'user_agent_change',
      'other',
    ]),
    meta: z
      .record(z.unknown())
      .refine((meta) => JSON.stringify(meta).length <= 2048, 'Meta must be at most 2 KB.')
      .optional(),
  })
  .strict();

export const heartbeatSchema = z
  .object({
    clientTime: z.string().optional(),
    visibilityState: z.string().optional(),
  })
  .strict()
  .optional();
