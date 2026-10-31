import { AttemptModel } from '../../models/attempt.js';
import { many, plain } from './helpers.js';

export class MongoAttemptRepository {
  async create(input) {
    const answers = Array.isArray(input.answers)
      ? input.answers
      : Object.values(input.answers || {});
    return plain(await AttemptModel.create({ ...input, answers }));
  }
  async createIfNoActive(examId, studentId, data, { maxAttempts = 1 } = {}) {
    const active = await AttemptModel.findOne({ examId, studentId, status: 'in_progress' }).lean();
    if (active) return { attempt: plain(active), created: false, reason: 'in_progress' };
    const count = await AttemptModel.countDocuments({ examId, studentId });
    if (count >= maxAttempts) return { attempt: null, created: false, reason: 'max_attempts' };
    try { return { attempt: await this.create({ ...data, examId, studentId, attemptNo: count + 1 }), created: true }; }
    catch (error) {
      if (error.code !== 11000) throw error;
      const winner = await AttemptModel.findOne({ examId, studentId, status: 'in_progress' }).lean();
      return { attempt: plain(winner), created: false, reason: 'in_progress' };
    }
  }
  async findById(id) { return plain(await AttemptModel.findById(id).lean()); }
  async findByIdAndStudent(id, studentId) { return plain(await AttemptModel.findOne({ _id: id, studentId }).lean()); }
  async findByExamAndStudent(examId, studentId) { return plain(await AttemptModel.findOne({ examId, studentId }).sort({ attemptNo: -1 }).lean()); }
  async listByExam(examId) { return many(await AttemptModel.find({ examId }).lean()); }
  async listByStudent(studentId) { return many(await AttemptModel.find({ studentId }).sort({ createdAt: -1 }).lean()); }
  async listSubmittedByExam(examId) { return many(await AttemptModel.find({ examId, status: { $in: ['submitted', 'auto_submitted'] } }).lean()); }
  async saveAnswerIfNewer(id, itemId, answer, clientSeq, now) {
    const value = { itemId, ...answer, clientSeq, updatedAt: now };
    const result = await AttemptModel.findOneAndUpdate(
      { _id: id, status: 'in_progress', answers: { $not: { $elemMatch: { itemId, clientSeq: { $gte: clientSeq } } } } },
      [{ $set: { answers: { $concatArrays: [
        { $filter: { input: '$answers', as: 'answer', cond: { $ne: ['$$answer.itemId', itemId] } } },
        [value],
      ] } } }],
      { new: true },
    ).lean();
    return result?.answers.find((entry) => entry.itemId === itemId) || null;
  }
  async recordViolation(id, violation, { cap = 100 } = {}) {
    return plain(await AttemptModel.findOneAndUpdate({ _id: id, status: 'in_progress' }, { $push: { violations: { $each: [violation], $slice: -cap } }, $inc: { violationCount: 1 } }, { new: true }).lean());
  }
  async finalizeIfInProgress(id, gradedPayload, { submittedAt, finalizedBy = 'submit' } = {}) {
    return plain(await AttemptModel.findOneAndUpdate({ _id: id, status: 'in_progress' }, { $set: { status: 'submitted', submittedAt: submittedAt || new Date(), gradedPayload, finalizedBy } }, { new: true }).lean());
  }
  async findExpiredInProgress(now, limit = 100) { return many(await AttemptModel.find({ status: 'in_progress', expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(limit).lean()); }
  async deleteByExam(examId) { const result = await AttemptModel.deleteMany({ examId }); return result.deletedCount || 0; }
}
