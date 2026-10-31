import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, notFound } from '../utils/errors.js';
import { publicUser } from '../utils/publicUser.js';
import { ok } from '../utils/respond.js';
import { paramsWithId } from '../validators/common.js';
import { userListQuerySchema, userPatchSchema } from '../validators/user.js';

export const userRouter = Router();

userRouter.use(requireAuth, requireRole('admin'));

userRouter.get(
  '/',
  validate(userListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { data, meta } = await req.app.locals.repos.userRepo.list(req.query);
    ok(res, data.map(publicUser), meta);
  }),
);

userRouter.patch(
  '/:id',
  validate(paramsWithId, 'params'),
  validate(userPatchSchema),
  asyncHandler(async (req, res) => {
    const { userRepo } = req.app.locals.repos;
    if (req.params.id === req.user.id && req.body.role && req.body.role !== 'admin') {
      throw new AppError(409, 'INVALID_STATE', 'You cannot remove your own admin role.');
    }
    if (req.params.id === req.user.id && req.body.isActive === false) {
      throw new AppError(409, 'INVALID_STATE', 'You cannot deactivate your own account.');
    }
    const updated = await userRepo.updateById(req.params.id, req.body);
    if (!updated) throw notFound('User not found.');
    ok(res, publicUser(updated));
  }),
);

userRouter.delete(
  '/:id',
  validate(paramsWithId, 'params'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw new AppError(409, 'INVALID_STATE', 'You cannot delete your own admin account.');
    }
    const target = await req.app.locals.repos.userRepo.findById(req.params.id);
    if (!target) throw notFound('User not found.');
    if (target.role === 'admin') {
      const admins = await req.app.locals.repos.userRepo.list({ role: 'admin', limit: 1 });
      if (admins.meta.summary.roleCounts.admin <= 1) {
        throw new AppError(409, 'INVALID_STATE', 'The last administrator cannot be deleted.');
      }
    }
    const deleted = await req.app.locals.repos.userRepo.deleteById(req.params.id);
    if (!deleted) throw notFound('User not found.');
    ok(res, { id: deleted.id, deleted: true });
  }),
);
