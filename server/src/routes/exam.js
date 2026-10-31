import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  availableExams,
  createExam,
  deleteExam,
  examAnalytics,
  examResults,
  exportResults,
  getExam,
  joinExam,
  listExams,
  monitorExam,
  publishExam,
  releaseResults,
  startAttempt,
  updateExam,
} from '../services/examService.js';
import { attemptState } from '../services/examPresenter.js';
import { ok } from '../utils/respond.js';
import { paramsWithId } from '../validators/common.js';
import {
  availableQuerySchema,
  examListQuerySchema,
  examPatchSchema,
  examSchema,
  joinSchema,
  monitorQuerySchema,
  resultsQuerySchema,
} from '../validators/exam.js';

export const examRouter = Router();

examRouter.use(requireAuth);

// Static paths must precede /:id.
examRouter.get(
  '/available',
  requireRole('student'),
  validate(availableQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await availableExams(req.app.locals.repos, req.user, req.query);
    ok(res, data, meta);
  }),
);

examRouter.post(
  '/join',
  requireRole('student'),
  validate(joinSchema),
  asyncHandler(async (req, res) => {
    ok(res, await joinExam(req.app.locals.repos, req.user, req.body.joinCode));
  }),
);

examRouter.get(
  '/',
  requireRole('teacher', 'admin'),
  validate(examListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await listExams(req.app.locals.repos, req.user, req.query);
    ok(res, data, meta);
  }),
);

examRouter.post(
  '/',
  requireRole('teacher', 'admin'),
  validate(examSchema),
  asyncHandler(async (req, res) => {
    const exam = await createExam(req.app.locals.repos, req.user, req.body);
    ok(res, exam, undefined, 201);
  }),
);

examRouter.get(
  '/:id',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await getExam(req.app.locals.repos, req.user, req.params.id));
  }),
);

examRouter.patch(
  '/:id',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  validate(examPatchSchema),
  asyncHandler(async (req, res) => {
    ok(res, await updateExam(req.app.locals.repos, req.user, req.params.id, req.body));
  }),
);

examRouter.delete(
  '/:id',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await deleteExam(req.app.locals.repos, req.user, req.params.id));
  }),
);

examRouter.post(
  '/:id/publish',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await publishExam(req.app.locals.repos, req.user, req.params.id));
  }),
);

examRouter.post(
  '/:id/start',
  requireRole('student'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    const { attempt, exam, created } = await startAttempt(req.app.locals.repos, req.user, req.params.id);
    ok(res, attemptState(attempt, exam), undefined, created ? 201 : 200);
  }),
);

// Teacher reporting stays under /exams so the contract paths match exactly.
examRouter.get(
  '/:id/monitor',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  validate(monitorQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await monitorExam(req.app.locals.repos, req.user, req.params.id, req.query);
    ok(res, data, meta);
  }),
);

examRouter.get(
  '/:id/results',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  validate(resultsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await examResults(req.app.locals.repos, req.user, req.params.id, req.query);
    ok(res, data, meta);
  }),
);

examRouter.get(
  '/:id/analytics',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await examAnalytics(req.app.locals.repos, req.user, req.params.id));
  }),
);

examRouter.post(
  '/:id/release-results',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await releaseResults(req.app.locals.repos, req.user, req.params.id));
  }),
);

examRouter.get(
  '/:id/results/export.csv',
  requireRole('teacher', 'admin'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    const { filename, csv } = await exportResults(req.app.locals.repos, req.user, req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  }),
);
