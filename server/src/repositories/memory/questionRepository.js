import { newId, nowIso } from '../../utils/ids.js';
import { paginate } from '../../utils/pagination.js';

const clone = (value) => structuredClone(value);

/** In-memory question repository. Archived questions disappear from reads. */
export class MemoryQuestionRepository {
  constructor() {
    /** @type {Map<string, import('../interfaces.js').QuestionRecord>} */
    this._questions = new Map();
  }

  async create(input) {
    const timestamp = nowIso();
    const question = {
      id: newId(),
      subject: String(input.subject).trim(),
      topic: String(input.topic).trim(),
      difficulty: input.difficulty,
      type: input.type,
      prompt: String(input.prompt).trim(),
      options: (input.options || []).map((option) => ({ id: option.id, text: String(option.text).trim() })),
      correctOptionIds: [...(input.correctOptionIds || [])],
      numericAnswer: input.numericAnswer ?? null,
      explanation: String(input.explanation || '').trim(),
      defaultMarks: Number(input.defaultMarks),
      negativeMarks: Number(input.negativeMarks || 0),
      createdBy: input.createdBy,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this._questions.set(question.id, question);
    return clone(question);
  }

  async findById(id) {
    const question = this._questions.get(id);
    return question && !question.isArchived ? clone(question) : null;
  }

  async findByIds(ids) {
    return ids
      .map((id) => this._questions.get(id))
      .filter((question) => question && !question.isArchived)
      .map(clone);
  }

  async updateById(id, patch) {
    const question = this._questions.get(id);
    if (!question || question.isArchived) return null;
    const updated = {
      ...question,
      ...(patch.subject !== undefined && { subject: String(patch.subject).trim() }),
      ...(patch.topic !== undefined && { topic: String(patch.topic).trim() }),
      ...(patch.difficulty !== undefined && { difficulty: patch.difficulty }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.prompt !== undefined && { prompt: String(patch.prompt).trim() }),
      ...(patch.options !== undefined && {
        options: patch.options.map((option) => ({ id: option.id, text: String(option.text).trim() })),
      }),
      ...(patch.correctOptionIds !== undefined && { correctOptionIds: [...patch.correctOptionIds] }),
      ...(patch.numericAnswer !== undefined && { numericAnswer: patch.numericAnswer }),
      ...(patch.explanation !== undefined && { explanation: String(patch.explanation).trim() }),
      ...(patch.defaultMarks !== undefined && { defaultMarks: Number(patch.defaultMarks) }),
      ...(patch.negativeMarks !== undefined && { negativeMarks: Number(patch.negativeMarks) }),
      updatedAt: nowIso(),
    };
    this._questions.set(id, updated);
    return clone(updated);
  }

  async archiveById(id) {
    const question = this._questions.get(id);
    if (!question || question.isArchived) return false;
    question.isArchived = true;
    question.updatedAt = nowIso();
    return true;
  }

  async deleteById(id) {
    return this._questions.delete(id);
  }

  async list({ createdBy, subject, topic, difficulty, type, q, page = 1, limit = 20 } = {}) {
    const visible = Array.from(this._questions.values()).filter(
      (question) => !question.isArchived && (!createdBy || question.createdBy === createdBy),
    );
    let rows = visible;
    if (subject) rows = rows.filter((question) => question.subject === subject);
    if (topic) rows = rows.filter((question) => question.topic === topic);
    if (difficulty) rows = rows.filter((question) => question.difficulty === difficulty);
    if (type) rows = rows.filter((question) => question.type === type);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (question) =>
          question.prompt.toLowerCase().includes(needle) ||
          question.subject.toLowerCase().includes(needle) ||
          question.topic.toLowerCase().includes(needle),
      );
    }
    rows = [...rows].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const { data, meta } = paginate(rows.map(clone), page, limit);
    return {
      data,
      meta: {
        ...meta,
        facets: {
          subjects: [...new Set(visible.map((question) => question.subject))].sort(),
          topics: [...new Set(visible.map((question) => question.topic))].sort(),
        },
      },
    };
  }

  clear() {
    this._questions.clear();
  }
}
