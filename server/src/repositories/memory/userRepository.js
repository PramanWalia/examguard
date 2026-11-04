import { newId, nowIso } from '../../utils/ids.js';
import { paginate } from '../../utils/pagination.js';
import { DuplicateEmailError } from '../errors.js';

const clone = (value) => structuredClone(value);
const MAX_SESSIONS_PER_USER = 20;

/**
 * In-memory user repository.
 */
export class MemoryUserRepository {
  constructor() {
    /** @type {Map<string, import('../interfaces.js').UserRecord>} */
    this._users = new Map();
    /** @type {Map<string, string>} */
    this._emailIndex = new Map();
  }

  async create(input) {
    const email = String(input.email || '').trim().toLowerCase();
    if (this._emailIndex.has(email)) throw new DuplicateEmailError();
    const timestamp = nowIso();
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
    const role = input.role || 'student';
    const approvalStatus =
      input.approvalStatus || (!isActive && role === 'teacher' ? 'pending' : 'approved');

    const user = {
      id: newId(),
      name: String(input.name || '').trim(),
      email,
      role,
      batchIds: [...(input.batchIds || [])],
      isActive,
      approvalStatus,
      passwordHash: input.passwordHash,
      tokenVersion: 0,
      sessions: [...(input.sessions || [])],
      joinedExamIds: [...(input.joinedExamIds || [])],
      createdAt: input.createdAt || timestamp,
      updatedAt: input.updatedAt || timestamp,
    };
    this._users.set(user.id, user);
    this._emailIndex.set(email, user.id);
    return clone(user);
  }

  async findByEmail(email) {
    const id = this._emailIndex.get(String(email || '').trim().toLowerCase());
    const user = id ? this._users.get(id) : null;
    return user ? clone(user) : null;
  }

  async findById(id) {
    const user = this._users.get(id);
    return user ? clone(user) : null;
  }

  async findByIds(ids) {
    return ids.map((id) => this._users.get(id)).filter(Boolean).map(clone);
  }

  async updateById(id, patch) {
    const user = this._users.get(id);
    if (!user) return null;
    const nextIsActive = patch.isActive !== undefined ? Boolean(patch.isActive) : user.isActive;
    const nextApprovalStatus =
      patch.approvalStatus !== undefined
        ? patch.approvalStatus
        : nextIsActive && user.approvalStatus === 'pending'
          ? 'approved'
          : user.approvalStatus;

    const updated = {
      ...user,
      ...(patch.name !== undefined && { name: String(patch.name).trim() }),
      ...(patch.role !== undefined && { role: patch.role }),
      ...(patch.batchIds !== undefined && { batchIds: [...patch.batchIds] }),
      ...(patch.isActive !== undefined && { isActive: nextIsActive }),
      approvalStatus: nextApprovalStatus,
      ...(patch.passwordHash !== undefined && { passwordHash: patch.passwordHash }),
      updatedAt: nowIso(),
    };
    this._users.set(id, updated);
    return clone(updated);
  }

  async deleteById(id) {
    const user = this._users.get(id);
    if (!user) return null;
    this._users.delete(id);
    this._emailIndex.delete(user.email);
    return clone(user);
  }

  async incrementTokenVersion(id) {
    const user = this._users.get(id);
    if (!user) return null;
    const updated = {
      ...user,
      tokenVersion: user.tokenVersion + 1,
      sessions: [],
      updatedAt: nowIso(),
    };
    this._users.set(id, updated);
    return clone(updated);
  }

  async createSession(userId, { sid, jti, expiresAt }) {
    const user = this._users.get(userId);
    if (!user) return null;
    const now = nowIso();
    const record = {
      sid,
      jti,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    };
    const activeSessions = (user.sessions || []).filter((entry) => !entry.revokedAt);
    user.sessions = [...activeSessions, record].slice(-MAX_SESSIONS_PER_USER);
    user.lastLoginAt = now;
    user.updatedAt = now;
    return clone(record);
  }

  async findSession(userId, sid) {
    const user = this._users.get(userId);
    if (!user || !sid) return null;
    const session = (user.sessions || []).find((entry) => entry.sid === sid);
    return session ? clone(session) : null;
  }

  async rotateSession(userId, sid, expectedJti, newJti, expiresAt) {
    const user = this._users.get(userId);
    if (!user || !sid) return null;
    const index = (user.sessions || []).findIndex(
      (entry) => entry.sid === sid && entry.jti === expectedJti && !entry.revokedAt,
    );
    if (index < 0) return null;
    const updatedSession = {
      ...user.sessions[index],
      jti: newJti,
      expiresAt: expiresAt || user.sessions[index].expiresAt,
    };
    user.sessions[index] = updatedSession;
    user.updatedAt = nowIso();
    return clone(updatedSession);
  }

  async revokeSession(userId, sid) {
    const user = this._users.get(userId);
    if (!user) return false;
    if (!sid) {
      user.tokenVersion += 1;
      user.sessions = [];
      user.updatedAt = nowIso();
      return true;
    }
    const session = (user.sessions || []).find((entry) => entry.sid === sid);
    if (!session) return false;
    session.revokedAt = nowIso();
    user.updatedAt = nowIso();
    return true;
  }

  async addJoinedExam(id, examId) {
    const user = this._users.get(id);
    if (!user) return;
    if (!user.joinedExamIds.includes(examId)) {
      user.joinedExamIds.push(examId);
      user.updatedAt = nowIso();
    }
  }

  async getJoinedExamIds(id) {
    return [...(this._users.get(id)?.joinedExamIds || [])];
  }

  async findUsersWhoJoined(examId) {
    return Array.from(this._users.values())
      .filter((user) => user.joinedExamIds.includes(examId))
      .map(clone);
  }

  async findStudentsInBatches(batchIds) {
    if (!batchIds?.length) return [];
    return Array.from(this._users.values())
      .filter(
        (user) =>
          user.role === 'student' &&
          user.isActive &&
          user.batchIds.some((batchId) => batchIds.includes(batchId)),
      )
      .map(clone);
  }

  async list({ role, q, batch, isActive, page = 1, limit = 20 } = {}) {
    const all = Array.from(this._users.values());
    let rows = all;
    if (role) rows = rows.filter((user) => user.role === role);
    if (isActive !== undefined) rows = rows.filter((user) => user.isActive === isActive);
    if (batch) rows = rows.filter((user) => user.batchIds.includes(batch));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (user) =>
          user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle),
      );
    }
    rows = [...rows].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const { data, meta } = paginate(rows.map(clone), page, limit);
    const batches = [...new Set(all.flatMap((user) => user.batchIds))]
      .sort()
      .map((id) => ({ id, name: id }));

    return {
      data,
      meta: {
        ...meta,
        summary: {
          total: all.length,
          active: all.filter((user) => user.isActive).length,
          inactive: all.filter((user) => !user.isActive).length,
          pendingTeachers: all.filter(
            (user) => user.role === 'teacher' && !user.isActive,
          ).length,
          roleCounts: {
            admin: all.filter((user) => user.role === 'admin').length,
            teacher: all.filter((user) => user.role === 'teacher').length,
            student: all.filter((user) => user.role === 'student').length,
          },
        },
        batches,
      },
    };
  }

  async platformStats() {
    const all = Array.from(this._users.values());
    return {
      totalUsers: all.length,
      activeUsers: all.filter((user) => user.isActive).length,
      roleCounts: {
        admin: all.filter((user) => user.role === 'admin').length,
        teacher: all.filter((user) => user.role === 'teacher').length,
        student: all.filter((user) => user.role === 'student').length,
      },
    };
  }

  clear() {
    this._users.clear();
    this._emailIndex.clear();
  }
}
