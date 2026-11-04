import { UserModel } from '../../models/user.js';
import { escapeRegex } from '../../utils/regex.js';
import { duplicateEmail, many, pageMeta, plain } from './helpers.js';

const CACHE_TTL_MS = 30_000;
const MAX_SESSIONS_PER_USER = 20;

export class MongoUserRepository {
  constructor() {
    this._cache = new Map();
  }

  _getCached(id) {
    const key = String(id);
    const cached = this._cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return structuredClone(cached.user);
  }

  _setCached(user) {
    if (!user?.id) return user;
    this._cache.set(String(user.id), {
      user: structuredClone(user),
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return user;
  }

  _invalidate(id) {
    if (id !== undefined && id !== null) {
      this._cache.delete(String(id));
    }
  }

  async create(input) {
    try {
      const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
      const role = input.role || 'student';
      const approvalStatus =
        input.approvalStatus || (!isActive && role === 'teacher' ? 'pending' : 'approved');
      const created = plain(
        await UserModel.create({
          ...input,
          isActive,
          approvalStatus,
        }),
      );
      return this._setCached(created);
    } catch (error) {
      duplicateEmail(error);
    }
  }

  async findByEmail(email) {
    return plain(
      await UserModel.findOne({ email: String(email).toLowerCase() })
        .select('+passwordHash')
        .lean(),
    );
  }

  async findById(id) {
    const cached = this._getCached(id);
    if (cached) return cached;
    const found = plain(await UserModel.findById(id).lean());
    return found ? this._setCached(found) : null;
  }

  async findByIds(ids) {
    return many(await UserModel.find({ _id: { $in: ids } }).lean());
  }

  async updateById(id, patch) {
    this._invalidate(id);
    const nextPatch = { ...patch };
    if (patch.isActive === true && patch.approvalStatus === undefined) {
      nextPatch.approvalStatus = 'approved';
    }
    const updated = plain(
      await UserModel.findByIdAndUpdate(
        id,
        { $set: nextPatch },
        { new: true, runValidators: true },
      ).lean(),
    );
    this._invalidate(id);
    return updated ? this._setCached(updated) : null;
  }

  async deleteById(id) {
    this._invalidate(id);
    return plain(await UserModel.findByIdAndDelete(id).lean());
  }

  async incrementTokenVersion(id) {
    this._invalidate(id);
    const updated = plain(
      await UserModel.findByIdAndUpdate(
        id,
        {
          $inc: { tokenVersion: 1 },
          $set: { sessions: [] },
        },
        { new: true },
      ).lean(),
    );
    this._invalidate(id);
    return updated ? this._setCached(updated) : null;
  }

  async createSession(userId, { sid, jti, expiresAt }) {
    this._invalidate(userId);
    const now = new Date();
    const record = {
      sid,
      jti,
      createdAt: now,
      expiresAt: new Date(expiresAt),
      revokedAt: null,
    };
    const updated = plain(
      await UserModel.findByIdAndUpdate(
        userId,
        {
          $push: {
            sessions: {
              $each: [record],
              $slice: -MAX_SESSIONS_PER_USER,
            },
          },
          $set: { lastLoginAt: now },
        },
        { new: true },
      ).lean(),
    );
    this._invalidate(userId);
    if (updated) this._setCached(updated);
    return updated?.sessions?.find((entry) => entry.sid === sid) || null;
  }

  async findSession(userId, sid) {
    if (!userId || !sid) return null;
    const user = await this.findById(userId);
    if (!user) return null;
    return (user.sessions || []).find((entry) => entry.sid === sid) || null;
  }

  async rotateSession(userId, sid, expectedJti, newJti, expiresAt) {
    if (!userId || !sid) return null;
    this._invalidate(userId);
    const updated = plain(
      await UserModel.findOneAndUpdate(
        {
          _id: userId,
          sessions: {
            $elemMatch: {
              sid,
              jti: expectedJti,
              revokedAt: null,
            },
          },
        },
        {
          $set: {
            'sessions.$.jti': newJti,
            ...(expiresAt ? { 'sessions.$.expiresAt': new Date(expiresAt) } : {}),
          },
        },
        { new: true },
      ).lean(),
    );
    this._invalidate(userId);
    if (!updated) return null;
    this._setCached(updated);
    return (updated.sessions || []).find((entry) => entry.sid === sid) || null;
  }

  async revokeSession(userId, sid) {
    if (!userId) return false;
    this._invalidate(userId);
    if (!sid) {
      await this.incrementTokenVersion(userId);
      return true;
    }
    const updated = plain(
      await UserModel.findOneAndUpdate(
        { _id: userId, 'sessions.sid': sid },
        { $set: { 'sessions.$.revokedAt': new Date() } },
        { new: true },
      ).lean(),
    );
    this._invalidate(userId);
    if (updated) this._setCached(updated);
    return Boolean(updated);
  }

  async addJoinedExam(id, examId) {
    this._invalidate(id);
    await UserModel.updateOne(
      { _id: id },
      { $addToSet: { joinedExamIds: examId } },
    );
    this._invalidate(id);
  }

  async getJoinedExamIds(id) {
    const user = await this.findById(id);
    return (user?.joinedExamIds || []).map(String);
  }

  async findUsersWhoJoined(examId) {
    return many(await UserModel.find({ joinedExamIds: examId }).lean());
  }

  async findStudentsInBatches(batchIds) {
    if (!batchIds?.length) return [];
    return many(
      await UserModel.find({
        role: 'student',
        isActive: true,
        batchIds: { $in: batchIds },
      }).lean(),
    );
  }

  async list({ role, q, batch, isActive, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (role) filter.role = role;
    if (batch) filter.batchIds = batch;
    if (isActive !== undefined) filter.isActive = isActive;
    if (q) {
      const safeQ = escapeRegex(q);
      filter.$or = [
        { name: new RegExp(safeQ, 'i') },
        { email: new RegExp(safeQ, 'i') },
      ];
    }

    const [rows, total, all] = await Promise.all([
      UserModel.find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter),
      UserModel.find().select('batchIds isActive role').lean(),
    ]);

    const roleCounts = Object.fromEntries(
      ['admin', 'teacher', 'student'].map((roleName) => [
        roleName,
        all.filter((entry) => entry.role === roleName).length,
      ]),
    );
    const batches = [...new Set(all.flatMap((entry) => entry.batchIds || []))].map((id) => ({
      id,
      name: id,
    }));

    return {
      data: many(rows),
      meta: {
        ...pageMeta(page, limit, total),
        summary: {
          total: all.length,
          active: all.filter((entry) => entry.isActive).length,
          inactive: all.filter((entry) => !entry.isActive).length,
          pendingTeachers: all.filter(
            (entry) => entry.role === 'teacher' && !entry.isActive,
          ).length,
          roleCounts,
        },
        batches,
      },
    };
  }

  async platformStats() {
    const rows = await UserModel.find().select('role isActive').lean();
    const roleCounts = Object.fromEntries(
      ['admin', 'teacher', 'student'].map((roleName) => [
        roleName,
        rows.filter((entry) => entry.role === roleName).length,
      ]),
    );
    return {
      totalUsers: rows.length,
      activeUsers: rows.filter((entry) => entry.isActive).length,
      roleCounts,
    };
  }

  async clear() {
    this._cache.clear();
    await UserModel.deleteMany({});
  }
}
