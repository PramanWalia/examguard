import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, tv: user.tokenVersion },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.ACCESS_TOKEN_TTL },
  );

export const signRefreshToken = (user) =>
  jwt.sign(
    { sub: user.id, tv: user.tokenVersion, type: 'refresh' },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.REFRESH_TOKEN_TTL },
  );

export const verifyAccessToken = (token) => jwt.verify(token, config.JWT_ACCESS_SECRET);

export const verifyRefreshToken = (token) => jwt.verify(token, config.JWT_REFRESH_SECRET);

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const clearRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 0,
});
