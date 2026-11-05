import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { DuplicateEmailError } from '../repositories/errors.js';
import { AppError, badRequest, conflict, unauthorized } from '../utils/errors.js';
import { publicUser } from '../utils/publicUser.js';
import {
  newSessionIdentifiers,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const createSession = async (userRepo, user) => {
  const { sid, jti } = newSessionIdentifiers();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  if (typeof userRepo.createSession === 'function') {
    await userRepo.createSession(user.id, { sid, jti, expiresAt });
  }
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user, { sid, jti }),
    refreshToken: signRefreshToken(user, { sid, jti }),
    pendingApproval: false,
  };
};

export const register = async (userRepo, input) => {
  if (!['student', 'teacher'].includes(input.role)) {
    throw badRequest('Self-registration only allows student or teacher.', [
      { path: 'role', message: 'Self-registration only allows student or teacher.' },
    ]);
  }

  let isActive = true;
  let approvalStatus = 'approved';

  if (input.role === 'teacher') {
    const inviteCode = String(input.inviteCode || '').trim();
    if (inviteCode) {
      if (!config.TEACHER_INVITE_CODE || inviteCode !== config.TEACHER_INVITE_CODE) {
        throw new AppError(
          403,
          'INVALID_INVITE_CODE',
          'Invalid teacher invite code. Leave blank to request administrator approval.',
        );
      }
      isActive = true;
      approvalStatus = 'approved';
    } else {
      isActive = false;
      approvalStatus = 'pending';
    }
  }

  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
  let user;
  try {
    user = await userRepo.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive,
      approvalStatus,
    });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      throw conflict('DUPLICATE_EMAIL', 'An account with this email already exists.');
    }
    throw error;
  }

  if (!user.isActive) {
    return {
      user: publicUser(user),
      accessToken: null,
      refreshToken: null,
      pendingApproval: true,
      message:
        'Teacher account registered and awaiting administrator approval. You will be able to log in once an admin activates your account.',
    };
  }

  return createSession(userRepo, user);
};

export const login = async (userRepo, { email, password }) => {
  const user = await userRepo.findByEmail(email);
  const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !matches) {
    throw unauthorized('Email or password is incorrect, or the account is inactive.');
  }
  if (!user.isActive) {
    if (user.role === 'teacher') {
      throw unauthorized(
        'Your teacher account is pending administrator approval. Please wait for an admin to approve your account.',
      );
    }
    throw unauthorized('Email or password is incorrect, or the account is inactive.');
  }
  return createSession(userRepo, user);
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

  if (payload.sid && payload.jti && typeof userRepo.rotateSession === 'function') {
    const nextJti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
    const rotatedSession = await userRepo.rotateSession(
      user.id,
      payload.sid,
      payload.jti,
      nextJti,
      expiresAt,
    );
    if (!rotatedSession) {
      // Replay of an already-rotated token invalidates this session family.
      await userRepo.revokeSession(user.id, payload.sid);
      throw unauthorized('Your session has expired. Sign in again.');
    }
    return {
      user: publicUser(user),
      accessToken: signAccessToken(user, { sid: payload.sid, jti: nextJti }),
      refreshToken: signRefreshToken(user, { sid: payload.sid, jti: nextJti }),
    };
  }

  const rotated = await userRepo.incrementTokenVersion(user.id);
  return createSession(userRepo, rotated);
};

export const logout = async (userRepo, userId, sid = null) => {
  if (sid && typeof userRepo.revokeSession === 'function') {
    await userRepo.revokeSession(userId, sid);
    return;
  }
  await userRepo.incrementTokenVersion(userId);
};
