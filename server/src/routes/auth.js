import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/authService.js';
import { publicUser } from '../utils/publicUser.js';
import { ok } from '../utils/respond.js';
import { clearRefreshCookieOptions, refreshCookieOptions } from '../utils/tokens.js';
import { loginSchema, registerSchema } from '../validators/auth.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.register(req.app.locals.repos.userRepo, req.body);
    res.cookie('refreshToken', session.refreshToken, refreshCookieOptions());
    ok(res, { user: session.user, accessToken: session.accessToken }, undefined, 201);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.app.locals.repos.userRepo, req.body);
    res.cookie('refreshToken', session.refreshToken, refreshCookieOptions());
    ok(res, { user: session.user, accessToken: session.accessToken });
  }),
);

authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const session = await authService.refresh(req.app.locals.repos.userRepo, req.cookies?.refreshToken);
    res.cookie('refreshToken', session.refreshToken, refreshCookieOptions());
    ok(res, { accessToken: session.accessToken });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.app.locals.repos.userRepo, req.user.id);
    res.clearCookie('refreshToken', clearRefreshCookieOptions());
    ok(res, { message: 'Logged out.' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    ok(res, publicUser(req.user));
  }),
);
