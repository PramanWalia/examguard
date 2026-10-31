import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { DuplicateEmailError } from '../repositories/errors.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { publicUser } from '../utils/publicUser.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';

/**
 * Auth business logic. Controllers/routes own cookies and status codes; this
 * module owns credentials and token rotation.
 */

const session = (user) => ({
  user: publicUser(user),
  accessToken: signAccessToken(user),
  refreshToken: signRefreshToken(user),
});

export const register = async (userRepo, input) => {
  if (!['student', 'teacher'].includes(input.role)) {
    throw badRequest('Self-registration only allows student or teacher.', [
      { path: 'role', message: 'Self-registration only allows student or teacher.' },
    ]);
  }
  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  let user;
  try {
    user = await userRepo.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive: true,
    });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      throw conflict('DUPLICATE_EMAIL', 'An account with this email already exists.');
    }
    throw error;
  }
  return session(user);
};

export const login = async (userRepo, { email, password }) => {
  const user = await userRepo.findByEmail(email);
  const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  // Deliberately identical for unknown email, wrong password, and inactive account.
  if (!user || !matches || !user.isActive) {
    throw unauthorized('Email or password is incorrect, or the account is inactive.');
  }
  return session(user);
};

export const refresh = async (userRepo, refreshToken) => {
  if (!refreshToken) throw unauthorized('Your session has expired. Sign in again.');
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Your session has expired. Sign in again.');
  }
  const user = await userRepo.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    throw unauthorized('Your session has expired. Sign in again.');
  }
  // Rotation: the presented token (tv) stops working once the version increments.
  const rotated = await userRepo.incrementTokenVersion(user.id);
  return session(rotated);
};

export const logout = async (userRepo, userId) => {
  await userRepo.incrementTokenVersion(userId);
};
