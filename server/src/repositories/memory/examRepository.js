import { randomInt } from 'node:crypto';

import { examPhase } from '../../utils/examTime.js';
import { newId, nowIso } from '../../utils/ids.js';
import { paginate } from '../../utils/pagination.js';

const clone = (value) => structuredClone(value);

/**
 * In-memory exam repository.
 *
 * `publish` is the only multi-field transition and runs synchronously: no
 * request can observe a half-published exam (draft items with published status).
 */
export class MemoryExamRepository {
  constructor() {
    /** @type {Map<string, import('../interfaces.js').ExamRecord>} */
    this._exams = new Map();
  }

  _uniqueJoinCode(title = 'EXAM') {
    const prefix =
      title
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20) || 'EXAM';
    const used = new Set(Array.from(this._exams.values()).map((exam) => exam.joinCode).filter(Boolean));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = `${prefix}-${randomInt(1000, 10000)}`.slice(0, 32);
      if (!used.has(code)) return code;
    }
    return `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`.slice(0, 32);
  }

  async create(input) {
    const timestamp = nowIso();
    const assignment = {
      batchIds: [...(input.assignment?.batchIds || [])],
      joinCodeEnabled: input.assignment?.joinCodeEnabled !== false,
    };
    const status = input.status === 'published' ? 'published' : 'draft';
    const exam = {
      id: newId(),
      title: String(input.title).trim(),
      description: String(input.description || '').trim(),
      durationMinutes: Number(input.durationMinutes),
      startAt: input.startAt,
      endAt: input.endAt,
      status,
      resultMode: input.resultMode || 'after_end',
      settings: {
        shuffleQuestions: input.settings?.shuffleQuestions ?? true,
        shuffleOptions: input.settings?.shuffleOptions ?? true,
        partialMarking: input.settings?.partialMarking ?? false,
        passPercentage: input.settings?.passPercentage ?? 40,
        violationLimit: input.settings?.violationLimit ?? 3,
        autoSubmitOnViolation: input.settings?.autoSubmitOnViolation ?? true,
        maxAttempts: input.settings?.maxAttempts ?? 1,
        numericTolerance: input.settings?.numericTolerance ?? 1e-9,
      },
      assignment,
      joinCode: input.joinCode || (status === 'published' && assignment.joinCodeEnabled ? this._uniqueJoinCode() : null),
      items: (input.items || []).map((item, index) => ({
        id: item.id || newId(),
        questionId: item.questionId,
        order: item.order ?? index + 1,
        marks: Number(item.marks),
        negativeMarks: Number(item.negativeMarks || 0),
        questionSnapshot: item.questionSnapshot ? clone(item.questionSnapshot) : null,
      })),
      totalMarks: 0,
      createdBy: input.createdBy,
      publishedAt: input.publishedAt || (status === 'published' ? timestamp : null),
      resultsReleasedAt: input.resultsReleasedAt || null,
      createdAt: input.createdAt || timestamp,
      updatedAt: input.updatedAt || timestamp,
    };
    exam.totalMarks = exam.items.reduce((sum, item) => sum + item.marks, 0);
    this._exams.set(exam.id, exam);
    return clone(exam);
  }

  async findById(id) {
    const exam = this._exams.get(id);
    return exam ? clone(exam) : null;
  }

  async updateById(id, patch) {
    const exam = this._exams.get(id);
    if (!exam) return null;
    const updated = {
      ...exam,
      ...(patch.title !== undefined && { title: String(patch.title).trim() }),
      ...(patch.description !== undefined && { description: String(patch.description).trim() }),
      ...(patch.durationMinutes !== undefined && { durationMinutes: Number(patch.durationMinutes) }),
      ...(patch.startAt !== undefined && { startAt: patch.startAt }),
      ...(patch.endAt !== undefined && { endAt: patch.endAt }),
      ...(patch.resultMode !== undefined && { resultMode: patch.resultMode }),
      ...(patch.settings !== undefined && { settings: { ...exam.settings, ...patch.settings } }),
      ...(patch.assignment !== undefined && { assignment: { ...exam.assignment, ...patch.assignment } }),
      ...(patch.items !== undefined && {
        items: patch.items.map((item, index) => ({
          id: item.id || newId(),
          questionId: item.questionId,
          order: item.order ?? index + 1,
          marks: Number(item.marks),
          negativeMarks: Number(item.negativeMarks || 0),
          questionSnapshot: item.questionSnapshot ? clone(item.questionSnapshot) : null,
        })),
      }),
      updatedAt: nowIso(),
    };
    updated.totalMarks = updated.items.reduce((sum, item) => sum + item.marks, 0);
    this._exams.set(id, updated);
    return clone(updated);
  }

  async updateDraftById(id, patch) {
    const exam = this._exams.get(id);
    if (!exam || exam.status !== 'draft') return null;
    return this.updateById(id, patch);
  }

  async publish(id, teacherId, prepared) {
    const exam = this._exams.get(id);
    if (!exam || exam.createdBy !== teacherId || exam.status !== 'draft') return null;
    // Synchronous transition: swap status, items and join code in one block.
    if (!prepared || !prepared.items?.length) return null;
    const joinCode = exam.assignment.joinCodeEnabled ? this._uniqueJoinCode(exam.title) : null;
    const published = {
      ...exam,
      status: 'published',
      items: prepared.items,
      totalMarks: prepared.totalMarks,
      joinCode,
      publishedAt: nowIso(),
      resultsReleasedAt: null,
      updatedAt: nowIso(),
    };
    this._exams.set(id, published);
    return clone(published);
  }

  async deleteById(id) {
    const exam = this._exams.get(id);
    if (!exam) return null;
    this._exams.delete(id);
    return clone(exam);
  }

  async list({ createdBy, status, q, page = 1, limit = 20 } = {}) {
    const visible = Array.from(this._exams.values()).filter(
      (exam) => !createdBy || exam.createdBy === createdBy,
    );
    let rows = visible;
    if (status) rows = rows.filter((exam) => exam.status === status);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((exam) => exam.title.toLowerCase().includes(needle));
    }
    rows = [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const now = new Date();
    const summary = {
      total: visible.length,
      live: visible.filter((exam) => examPhase(exam, now) === 'live').length,
      upcoming: visible.filter((exam) => examPhase(exam, now) === 'upcoming').length,
      ended: visible.filter((exam) => examPhase(exam, now) === 'ended').length,
      published: visible.filter((exam) => exam.status === 'published').length,
      draft: visible.filter((exam) => exam.status === 'draft').length,
    };
    const discovered = [...new Set(visible.flatMap((exam) => exam.assignment.batchIds))].sort();
    const batches = (discovered.length ? discovered : ['CSE-A', 'CSE-B', 'ECE-A']).map((id) => ({
      id,
      name: id,
    }));

    const { data, meta } = paginate(rows.map(clone), page, limit);
    return { data, meta: { ...meta, summary, batches } };
  }

  async findByJoinCode(code) {
    const needle = String(code || '').trim().toUpperCase();
    const exam = Array.from(this._exams.values()).find((entry) => entry.joinCode === needle);
    return exam ? clone(exam) : null;
  }

  async releaseResults(id) {
    const exam = this._exams.get(id);
    if (!exam || exam.status !== 'published') return null;
    if (!exam.resultsReleasedAt) {
      exam.resultsReleasedAt = nowIso();
      exam.updatedAt = exam.resultsReleasedAt;
    }
    return clone(exam);
  }

  async isQuestionReferenced(questionId) {
    return Array.from(this._exams.values()).some((exam) =>
      exam.items.some((item) => item.questionId === questionId),
    );
  }

  async platformStats() {
    const exams = Array.from(this._exams.values());
    const now = new Date();
    return {
      totalExams: exams.length,
      publishedExams: exams.filter((exam) => exam.status === 'published').length,
      draftExams: exams.filter((exam) => exam.status === 'draft').length,
      liveExams: exams.filter((exam) => examPhase(exam, now) === 'live').length,
    };
  }

  clear() {
    this._exams.clear();
  }
}
