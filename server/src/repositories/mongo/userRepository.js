import { UserModel } from '../../models/user.js';
import { escapeRegex } from '../../utils/regex.js';
import { duplicateEmail, many, pageMeta, plain } from './helpers.js';

export class MongoUserRepository {
  async create(input) { try { return plain(await UserModel.create(input)); } catch (error) { duplicateEmail(error); } }
  async findByEmail(email) { return plain(await UserModel.findOne({ email: String(email).toLowerCase() }).select('+passwordHash').lean()); }
  async findById(id) { return plain(await UserModel.findById(id).lean()); }
  async findByIds(ids) { return many(await UserModel.find({ _id: { $in: ids } }).lean()); }
  async updateById(id, patch) { return plain(await UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean()); }
  async deleteById(id) { return plain(await UserModel.findByIdAndDelete(id).lean()); }
  async incrementTokenVersion(id) { return plain(await UserModel.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true }).lean()); }
  async addJoinedExam(id, examId) { await UserModel.updateOne({ _id: id }, { $addToSet: { joinedExamIds: examId } }); }
  async getJoinedExamIds(id) { const user = await UserModel.findById(id).select('joinedExamIds').lean(); return (user?.joinedExamIds || []).map(String); }
  async findUsersWhoJoined(examId) { return many(await UserModel.find({ joinedExamIds: examId }).lean()); }
  async findStudentsInBatches(batchIds) { return many(await UserModel.find({ role: 'student', isActive: true, batchIds: { $in: batchIds } }).lean()); }
  async list({ role, q, batch, isActive, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (role) filter.role = role; if (batch) filter.batchIds = batch; if (isActive !== undefined) filter.isActive = isActive;
    if (q) {
      const safeQ = escapeRegex(q);
      filter.$or = [{ name: new RegExp(safeQ, 'i') }, { email: new RegExp(safeQ, 'i') }];
    }
    const [rows, total, all] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      UserModel.countDocuments(filter), UserModel.find().select('batchIds isActive role').lean(),
    ]);
    return { data: many(rows), meta: { ...pageMeta(page, limit, total), summary: { total: all.length, active: all.filter((x) => x.isActive).length, inactive: all.filter((x) => !x.isActive).length, roleCounts: Object.fromEntries(['admin', 'teacher', 'student'].map((r) => [r, all.filter((x) => x.role === r).length])) }, batches: [...new Set(all.flatMap((x) => x.batchIds || []))].map((id) => ({ id, name: id })) } };
  }
  async platformStats() { const rows = await UserModel.find().select('role isActive').lean(); return { totalUsers: rows.length, activeUsers: rows.filter((x) => x.isActive).length, roleCounts: Object.fromEntries(['admin', 'teacher', 'student'].map((r) => [r, rows.filter((x) => x.role === r).length])) }; }
}
