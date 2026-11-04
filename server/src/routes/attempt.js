import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getAttempt,
  getResult,
  recordHeartbeat,
  recordViolation,
  saveAnswer,
  submitAttempt,
} from '../services/examService.js';
import { ok } from '../utils/respond.js';
import { paramsWithId } from '../validators/common.js';
import { answerSchema, heartbeatSchema, violationSchema } from '../validators/attempt.js';

export const attemptRouter = Router();

const clientContextFrom = (req) => ({
  ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
  userAgent: req.get('user-agent') || null,
});

attemptRouter.use(requireAuth);

attemptRouter.get(
  '/:id',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await getAttempt(req.app.locals.repos, req.user, req.params.id));
  }),
);

attemptRouter.patch(
  '/:id/answer',
  requireRole('student'),
  validate(paramsWithId, 'params'),
  validate(answerSchema),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await saveAnswer(
        req.app.locals.repos,
        req.user,
        req.params.id,
        req.body,
        clientContextFrom(req),
      ),
    );
  }),
);

attemptRouter.post(
  '/:id/heartbeat',
  requireRole('student'),
  validate(paramsWithId, 'params'),
  validate(heartbeatSchema),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await recordHeartbeat(
        req.app.locals.repos,
        req.user,
        req.params.id,
        clientContextFrom(req),
      ),
    );
  }),
);

attemptRouter.post(
  '/:id/violation',
  requireRole('student'),
  validate(paramsWithId, 'params'),
  validate(violationSchema),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await recordViolation(req.app.locals.repos, req.user, req.params.id, req.body),
      undefined,
      201,
    );
  }),
);

attemptRouter.post(
  '/:id/submit',
  requireRole('student'),
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await submitAttempt(req.app.locals.repos, req.user, req.params.id));
  }),
);

attemptRouter.get(
  '/:id/result',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await getResult(req.app.locals.repos, req.user, req.params.id));
  }),
);
