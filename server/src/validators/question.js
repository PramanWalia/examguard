import { z } from 'zod';

import { paginationFields } from './common.js';

const optionSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9]{1,8}$/, 'Option id must be 1–8 lowercase letters or digits.'),
    text: z.string().trim().min(1, 'Option text is required.').max(500, 'Option text is limited to 500 characters.'),
  })
  .strict();

const questionFields = z.object({
  subject: z.string().trim().min(1, 'Subject is required.').max(80, 'Subject is limited to 80 characters.'),
  topic: z.string().trim().min(1, 'Topic is required.').max(80, 'Topic is limited to 80 characters.'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  type: z.enum(['single_choice', 'multiple_choice', 'numeric']),
  prompt: z.string().trim().min(5, 'Prompt must be 5–2000 characters.').max(2000, 'Prompt must be 5–2000 characters.'),
  options: z.array(optionSchema).max(6, 'A question can have at most 6 options.').default([]),
  correctOptionIds: z.array(z.string().trim()).max(6).default([]),
  numericAnswer: z.number().finite('Enter a finite numeric answer.').nullable().default(null),
  explanation: z.string().trim().max(2000, 'Explanation is limited to 2000 characters.').default(''),
  defaultMarks: z.number().min(0, 'Default marks must be 0–100.').max(100, 'Default marks must be 0–100.'),
  negativeMarks: z.number().min(0, 'Negative marks must be 0–100.').max(100, 'Negative marks must be 0–100.').default(0),
});

const questionRules = (body, context) => {
  if (body.negativeMarks > body.defaultMarks) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['negativeMarks'],
      message: 'Negative marks cannot exceed default marks.',
    });
  }

  if (body.type === 'numeric') {
    if (!Number.isFinite(body.numericAnswer)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numericAnswer'],
        message: 'A finite numeric answer is required.',
      });
    }
    if (body.options.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Numeric questions cannot have options.',
      });
    }
    if (body.correctOptionIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctOptionIds'],
        message: 'Numeric questions cannot have correct option ids.',
      });
    }
    return;
  }

  if (body.options.length < 2 || body.options.length > 6) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Choice questions need 2–6 options.',
    });
    return;
  }
  const optionIds = new Set(body.options.map((option) => option.id));
  if (optionIds.size !== body.options.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Option ids must be unique.',
    });
  }
  if (new Set(body.correctOptionIds).size !== body.correctOptionIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionIds'],
      message: 'Correct options must be unique.',
    });
  }
  if (body.type === 'single_choice' && body.correctOptionIds.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionIds'],
      message: 'Single choice needs exactly one correct option.',
    });
  }
  if (body.type === 'multiple_choice' && body.correctOptionIds.length < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionIds'],
      message: 'Multiple choice needs at least one correct option.',
    });
  }
  if (!body.correctOptionIds.every((id) => optionIds.has(id))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correctOptionIds'],
      message: 'Correct options must reference an option.',
    });
  }
  if (body.numericAnswer !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numericAnswer'],
      message: 'Choice questions cannot have a numeric answer.',
    });
  }
};

export const questionSchema = questionFields.strict().superRefine(questionRules);

export const questionPatchSchema = questionFields.partial().strict();

export const questionListQuerySchema = z
  .object({
    subject: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(80).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    type: z.enum(['single_choice', 'multiple_choice', 'numeric']).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    ...paginationFields,
  })
  .strict();

export const requiredImportHeaders = [
  'subject',
  'topic',
  'difficulty',
  'type',
  'prompt',
  'correctoptions',
  'defaultmarks',
];
