import { asyncHandler } from './asyncHandler.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';

/** Every protected route loads the live user, so role/active/token revocation are never stale. */
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

  const user = await req.app.locals.repos.userRepo.findById(payload.sub);
  // tokenVersion increments on refresh/logout, so old tokens are revoked.
  if (!user || user.tokenVersion !== payload.tv) throw unauthorized();
  if (!user.isActive) throw forbidden('This account is inactive.');

  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
