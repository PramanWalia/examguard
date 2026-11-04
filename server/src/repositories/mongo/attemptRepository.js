import { AttemptModel } from '../../models/attempt.js';
import { computeTimeTakenSeconds } from '../memory/attemptRepository.js';
import { many, plain } from './helpers.js';

export class MongoAttemptRepository {
  async create(input) {
    const answers = Array.isArray(input.answers)
      ? input.answers
      : Object.values(input.answers || {});
    const status = input.status === 'submitted' ? 'submitted' : 'in_progress';
    const timeTakenSeconds =
      input.timeTakenSeconds !== undefined && input.timeTakenSeconds !== null
        ? input.timeTakenSeconds
        : status === 'submitted' && input.submittedAt
          ? computeTimeTakenSeconds(
              input.startedAt,
              input.submittedAt,
              input.examSnapshot?.durationMinutes,
            )
          : null;

    const created = await AttemptModel.create({
      ...input,
      status,
      answers,
      timeTakenSeconds,
    });
    return plain(created);
  }

  async createIfNoActive(examId, studentId, data, { maxAttempts = 1 } = {}) {
    const active = await AttemptModel.findOne({
      examId,
      studentId,
      status: 'in_progress',
    }).lean();
    if (active) {
      return { attempt: plain(active), created: false, reason: 'in_progress' };
    }

    const count = await AttemptModel.countDocuments({ examId, studentId });
    if (count >= maxAttempts) {
      return { attempt: null, created: false, reason: 'max_attempts' };
    }

    try {
      const attempt = await this.create({
        ...data,
        examId,
        studentId,
        attemptNo: count + 1,
      });
      return { attempt, created: true };
    } catch (error) {
      if (error.code !== 11000) throw error;
      const winner = await AttemptModel.findOne({
        examId,
        studentId,
        status: 'in_progress',
      }).lean();
      return { attempt: plain(winner), created: false, reason: 'in_progress' };
    }
  }

  async findById(id) {
    return plain(await AttemptModel.findById(id).lean());
  }

  async findByIdAndStudent(id, studentId) {
    return plain(await AttemptModel.findOne({ _id: id, studentId }).lean());
  }

  async findByExamAndStudent(examId, studentId) {
    return plain(
      await AttemptModel.findOne({ examId, studentId })
        .sort({ attemptNo: -1 })
        .lean(),
    );
  }

  async listByExam(examId) {
    return many(await AttemptModel.find({ examId }).lean());
  }

  async listByStudent(studentId) {
    return many(
      await AttemptModel.find({ studentId })
        .sort({ createdAt: -1 })
        .lean(),
    );
  }

  async listSubmittedByExam(examId) {
    return many(
      await AttemptModel.find({
        examId,
        status: 'submitted',
      }).lean(),
    );
  }

  async saveAnswerIfNewer(id, itemId, answer, clientSeq, now) {
    const value = { itemId, ...answer, clientSeq, updatedAt: now };
    const result = await AttemptModel.findOneAndUpdate(
      {
        _id: id,
        status: 'in_progress',
        answers: {
          $not: {
            $elemMatch: {
              itemId,
              clientSeq: { $gte: clientSeq },
            },
          },
        },
      },
      [
        {
          $set: {
            answers: {
              $concatArrays: [
                {
                  $filter: {
                    input: '$answers',
                    as: 'answer',
                    cond: { $ne: ['$$answer.itemId', itemId] },
                  },
                },
                [value],
              ],
            },
            'clientSession.lastAnswerAt': new Date(now),
            'clientSession.lastHeartbeatAt': new Date(now),
          },
        },
      ],
      { new: true },
    ).lean();

    const saved = result?.answers?.find((entry) => entry.itemId === itemId);
    if (!saved) return null;
    return {
      ...saved,
      updatedAt:
        saved.updatedAt instanceof Date ? saved.updatedAt.toISOString() : saved.updatedAt,
    };
  }

  async updateClientContext(id, patch) {
    const setFields = {};
    for (const [key, value] of Object.entries(patch || {})) {
      setFields[`clientSession.${key}`] = value;
    }
    return plain(
      await AttemptModel.findOneAndUpdate(
        { _id: id, status: 'in_progress' },
        { $set: setFields },
        { new: true },
      ).lean(),
    );
  }

  async recordViolation(id, violation, { cap = 100 } = {}) {
    const entry = {
      type: violation.type,
      source: violation.source || 'client',
      meta: violation.meta || {},
      occurredAt: violation.occurredAt || new Date(),
    };
    return plain(
      await AttemptModel.findOneAndUpdate(
        { _id: id, status: 'in_progress' },
        {
          $push: {
            violations: {
              $each: [entry],
              $slice: -cap,
            },
          },
          $inc: { violationCount: 1 },
        },
        { new: true },
      ).lean(),
    );
  }

  async finalizeIfInProgress(id, gradedPayload, { submittedAt, finalizedBy = 'submit' } = {}) {
    const existing = await AttemptModel.findOne({ _id: id, status: 'in_progress' })
      .select('startedAt examSnapshot')
      .lean();
    if (!existing) return null;

    const endedAt = submittedAt ? new Date(submittedAt) : new Date();
    const timeTakenSeconds = computeTimeTakenSeconds(
      existing.startedAt,
      endedAt,
      existing.examSnapshot?.durationMinutes,
    );

    return plain(
      await AttemptModel.findOneAndUpdate(
        { _id: id, status: 'in_progress' },
        {
          $set: {
            status: 'submitted',
            submittedAt: endedAt,
            gradedPayload,
            finalizedBy,
            timeTakenSeconds,
          },
        },
        { new: true },
      ).lean(),
    );
  }

  async findExpiredInProgress(now, limit = 100) {
    return many(
      await AttemptModel.find({
        status: 'in_progress',
        expiresAt: { $lte: now },
      })
        .sort({ expiresAt: 1 })
        .limit(limit)
        .lean(),
    );
  }

  async findExpiredInProgressByExam(examId, now) {
    return many(
      await AttemptModel.find({
        examId,
        status: 'in_progress',
        expiresAt: { $lte: now },
      })
        .sort({ expiresAt: 1 })
        .lean(),
    );
  }

  async deleteByExam(examId) {
    const result = await AttemptModel.deleteMany({ examId });
    return result.deletedCount || 0;
  }

  async clear() {
    await AttemptModel.deleteMany({});
  }
}
