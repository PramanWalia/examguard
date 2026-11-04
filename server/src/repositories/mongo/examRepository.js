import { ExamModel } from '../../models/exam.js';
import { examPhase } from '../../utils/examTime.js';
import { escapeRegex } from '../../utils/regex.js';
import { many, pageMeta, plain } from './helpers.js';

export class MongoExamRepository {
  async create(input) {
    return plain(await ExamModel.create(input));
  }

  async findById(id) {
    return plain(await ExamModel.findById(id).lean());
  }

  async findByIds(ids) {
    const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!uniqueIds.length) return [];
    return many(await ExamModel.find({ _id: { $in: uniqueIds } }).lean());
  }

  async updateById(id, patch) {
    return plain(
      await ExamModel.findByIdAndUpdate(
        id,
        { $set: patch },
        { new: true, runValidators: true },
      ).lean(),
    );
  }

  async updateDraftById(id, patch) {
    return plain(
      await ExamModel.findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: patch },
        { new: true, runValidators: true },
      ).lean(),
    );
  }

  async publish(id, teacherId, prepared) {
    if (!prepared?.items?.length) return null;
    return plain(
      await ExamModel.findOneAndUpdate(
        { _id: id, createdBy: teacherId, status: 'draft' },
        {
          $set: {
            status: 'published',
            items: prepared.items,
            totalMarks: prepared.totalMarks,
            joinCode: prepared.joinCode || `${id.slice(-8).toUpperCase()}`,
            publishedAt: new Date(),
            resultsReleasedAt: null,
          },
        },
        { new: true },
      ).lean(),
    );
  }

  async deleteById(id) {
    return plain(await ExamModel.findByIdAndDelete(id).lean());
  }

  async list({ createdBy, status, q, page = 1, limit = 20 } = {}) {
    const filter = {};
    if (createdBy) filter.createdBy = createdBy;
    if (status) filter.status = status;
    if (q) filter.title = new RegExp(escapeRegex(q), 'i');

    const scopeFilter = createdBy ? { createdBy } : {};
    const [rows, total, visible] = await Promise.all([
      ExamModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExamModel.countDocuments(filter),
      ExamModel.find(scopeFilter).select('status startAt endAt assignment').lean(),
    ]);

    const now = new Date();
    const summary = {
      total: visible.length,
      live: visible.filter((exam) => examPhase(exam, now) === 'live').length,
      upcoming: visible.filter((exam) => examPhase(exam, now) === 'upcoming').length,
      ended: visible.filter((exam) => examPhase(exam, now) === 'ended').length,
      published: visible.filter((exam) => exam.status === 'published').length,
      draft: visible.filter((exam) => exam.status === 'draft').length,
    };
    const discovered = [
      ...new Set(visible.flatMap((exam) => exam.assignment?.batchIds || [])),
    ].sort();
    const batches = (discovered.length ? discovered : ['CSE-A', 'CSE-B', 'ECE-A']).map((id) => ({
      id,
      name: id,
    }));

    return {
      data: many(rows),
      meta: { ...pageMeta(page, limit, total), summary, batches },
    };
  }

  async listEligibleForStudent({
    batchIds = [],
    joinedExamIds = [],
    scope = 'all',
    submittedExamIds = [],
    now = new Date(),
    page = 1,
    limit = 20,
  } = {}) {
    const eligibilityClauses = [];
    if (batchIds.length > 0) {
      eligibilityClauses.push({ 'assignment.batchIds': { $in: batchIds } });
    }
    if (joinedExamIds.length > 0) {
      eligibilityClauses.push({ _id: { $in: joinedExamIds } });
    }
    if (!eligibilityClauses.length) {
      return { data: [], meta: pageMeta(page, limit, 0) };
    }

    const nowDate = now instanceof Date ? now : new Date(now);
    const andClauses = [{ status: 'published' }, { $or: eligibilityClauses }];

    if (scope === 'upcoming') {
      andClauses.push({ startAt: { $gt: nowDate } });
    } else if (scope === 'live') {
      andClauses.push({ startAt: { $lte: nowDate }, endAt: { $gte: nowDate } });
      if (submittedExamIds.length > 0) {
        andClauses.push({ _id: { $nin: submittedExamIds } });
      }
    } else if (scope === 'past') {
      const pastClauses = [{ endAt: { $lt: nowDate } }];
      if (submittedExamIds.length > 0) {
        pastClauses.push({ _id: { $in: submittedExamIds } });
      }
      andClauses.push({ $or: pastClauses });
    }

    const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
    const total = await ExamModel.countDocuments(filter);
    const meta = pageMeta(page, limit, total);
    const rows = await ExamModel.find(filter)
      .sort({ startAt: 1 })
      .skip((meta.page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data: many(rows),
      meta,
    };
  }

  async findByJoinCode(code) {
    return plain(
      await ExamModel.findOne({
        joinCode: String(code).trim().toUpperCase(),
      }).lean(),
    );
  }

  async releaseResults(id) {
    const updated = await ExamModel.findOneAndUpdate(
      { _id: id, status: 'published', resultsReleasedAt: null },
      { $set: { resultsReleasedAt: new Date() } },
      { new: true },
    ).lean();
    return plain(updated) || this.findById(id);
  }

  async isQuestionReferenced(questionId) {
    return Boolean(await ExamModel.exists({ 'items.questionId': questionId }));
  }

  async platformStats() {
    const rows = await ExamModel.find().select('status startAt endAt').lean();
    const now = Date.now();
    return {
      totalExams: rows.length,
      publishedExams: rows.filter((exam) => exam.status === 'published').length,
      draftExams: rows.filter((exam) => exam.status === 'draft').length,
      liveExams: rows.filter(
        (exam) =>
          exam.status === 'published' &&
          now >= exam.startAt.getTime() &&
          now <= exam.endAt.getTime(),
      ).length,
    };
  }

  async clear() {
    await ExamModel.deleteMany({});
  }
}
