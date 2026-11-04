import { Router } from 'express';
import multer from 'multer';

import { config } from '../config/env.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as questionService from '../services/questionService.js';
import { importQuestions } from '../services/importService.js';
import { AppError, badRequest } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { paramsWithId } from '../validators/common.js';
import { questionListQuerySchema, questionPatchSchema, questionSchema } from '../validators/question.js';

export const questionRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.IMPORT_MAX_BYTES, files: 1 },
});

questionRouter.use(requireAuth, requireRole('teacher', 'admin'));

questionRouter.get(
  '/',
  validate(questionListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await questionService.listQuestions(req.app.locals.repos.questionRepo, req.user, req.query);
    ok(res, data, meta);
  }),
);

questionRouter.post(
  '/',
  validate(questionSchema),
  asyncHandler(async (req, res) => {
    const question = await questionService.createQuestion(req.app.locals.repos.questionRepo, req.user, req.body);
    ok(res, question, undefined, 201);
  }),
);

questionRouter.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('One or more fields are invalid.', [
        { path: 'file', message: 'Choose a CSV file.' },
      ]);
    }
    const extension = req.file.originalname.split('.').pop()?.toLowerCase();
    if (extension !== 'csv') {
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only CSV files are supported.');
    }
    const result = await importQuestions(req.app.locals.repos.questionRepo, req.user, req.file.buffer);
    ok(res, result);
  }),
);

questionRouter.get(
  '/:id',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    const question = await questionService.getQuestion(req.app.locals.repos.questionRepo, req.user, req.params.id);
    ok(res, question);
  }),
);

questionRouter.patch(
  '/:id',
  validate(paramsWithId, 'params'),
  validate(questionPatchSchema),
  asyncHandler(async (req, res) => {
    const question = await questionService.updateQuestion(
      req.app.locals.repos.questionRepo,
      req.user,
      req.params.id,
      req.body,
    );
    ok(res, question);
  }),
);

questionRouter.delete(
  '/:id',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    const result = await questionService.deleteQuestion(
      req.app.locals.repos.questionRepo,
      req.app.locals.repos.examRepo,
      req.user,
      req.params.id,
    );
    ok(res, result);
  }),
);
