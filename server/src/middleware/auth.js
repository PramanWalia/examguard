import { asyncHandler } from './asyncHandler.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Validate bearer access token and verify user/session state via repository
 * (which maintains an invalidated in-memory cache to avoid per-request DB churn).
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized();
  }
  if (payload.type === 'refresh') throw unauthorized();

  const { userRepo } = req.app.locals.repos;
  const user = await userRepo.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tv) throw unauthorized();

  if (payload.sid && typeof userRepo.findSession === 'function') {
    const session = await userRepo.findSession(user.id, payload.sid);
    if (!session || session.revokedAt) {
      throw unauthorized();
    }
  }

  if (!user.isActive) throw forbidden('This account is inactive.');

  req.user = user;
  req.authPayload = payload;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
