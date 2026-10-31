import { newId, nowIso } from '../../utils/ids.js';

const clone = (value) => structuredClone(value);

const makeAttempt = (input) => ({
  id: input.id || newId(),
  examId: input.examId,
  studentId: input.studentId,
  status: input.status || 'in_progress',
  startedAt: input.startedAt,
  expiresAt: input.expiresAt,
  submittedAt: input.submittedAt || null,
  questionSet: clone(input.questionSet || []),
  examSnapshot: clone(input.examSnapshot || {}),
  answers: clone(input.answers || {}),
  violations: clone(input.violations || []),
  gradedPayload: input.gradedPayload || null,
  finalizedBy: input.finalizedBy || null,
  timeTakenSeconds: input.timeTakenSeconds ?? null,
});

/**
 * In-memory attempt repository.
 *
 * The three invariants that matter are each one synchronous block:
 *  - createIfNoActive: count, check, insert.
 *  - saveAnswerIfNewer: compare clientSeq, then write.
 *  - finalizeIfInProgress: check status, then flip it.
 *
 * See repositories/interfaces.js for why this is only process-local safety.
 */
export class MemoryAttemptRepository {
  constructor() {
    /** @type {Map<string, import('../interfaces.js').AttemptRecord>} */
    this._attempts = new Map();
  }

  async create(input) {
    const attempt = makeAttempt(input);
    this._attempts.set(attempt.id, attempt);
    return clone(attempt);
  }

  async createIfNoActive(examId, studentId, data, { maxAttempts = 1 } = {}) {
    const existing = Array.from(this._attempts.values()).filter(
      (attempt) => attempt.examId === examId && attempt.studentId === studentId,
    );
    const active = existing.find((attempt) => attempt.status === 'in_progress');
    if (active) return { attempt: clone(active), created: false, reason: 'in_progress' };
    if (existing.length >= maxAttempts) return { attempt: null, created: false, reason: 'max_attempts' };

    // No await between the checks above and the insert below.
    const attempt = makeAttempt({ ...data, examId, studentId });
    this._attempts.set(attempt.id, attempt);
    return { attempt: clone(attempt), created: true };
  }

  async findById(id) {
    const attempt = this._attempts.get(id);
    return attempt ? clone(attempt) : null;
  }

  async findByIdAndStudent(id, studentId) {
    const attempt = this._attempts.get(id);
    return attempt && attempt.studentId === studentId ? clone(attempt) : null;
  }

  async findByExamAndStudent(examId, studentId) {
    const attempt = Array.from(this._attempts.values()).find(
      (entry) => entry.examId === examId && entry.studentId === studentId,
    );
    return attempt ? clone(attempt) : null;
  }

  async listByExam(examId) {
    return Array.from(this._attempts.values())
      .filter((attempt) => attempt.examId === examId)
      .map(clone);
  }

  async listByStudent(studentId) {
    return Array.from(this._attempts.values())
      .filter((attempt) => attempt.studentId === studentId)
      .map(clone);
  }

  async listSubmittedByExam(examId) {
    return Array.from(this._attempts.values())
      .filter((attempt) => attempt.examId === examId && attempt.status === 'submitted')
      .map(clone);
  }

  async saveAnswerIfNewer(id, itemId, answer, clientSeq, now) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;
    const existing = attempt.answers[itemId];
    if (existing && clientSeq <= existing.clientSeq) return null;

    // No await between the stale check and the write.
    const stored = {
      itemId,
      selectedOptionIds: [...(answer.selectedOptionIds || [])],
      numericValue: answer.numericValue ?? null,
      markedForReview: Boolean(answer.markedForReview),
      clientSeq,
      updatedAt: now,
    };
    attempt.answers[itemId] = stored;
    return clone(stored);
  }

  async recordViolation(id, violation, { cap = 100 } = {}) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;
    const entry = {
      type: violation.type,
      meta: clone(violation.meta || {}),
      occurredAt: violation.occurredAt || nowIso(),
    };
    // Keep the newest evidence when the cap is reached.
    attempt.violations = [...attempt.violations, entry].slice(-cap);
    return clone(attempt);
  }

  async finalizeIfInProgress(id, gradedPayload, { submittedAt, finalizedBy = 'submit' } = {}) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;

    // No await between the status check above and the transition below.
    const endedAt = submittedAt || nowIso();
    const elapsed = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000));
    const updated = {
      ...attempt,
      status: 'submitted',
      submittedAt: endedAt,
      gradedPayload: clone(gradedPayload),
      finalizedBy,
      timeTakenSeconds: Math.min(elapsed, Math.max(0, attempt.examSnapshot?.durationMinutes || 0) * 60 || elapsed),
    };
    this._attempts.set(id, updated);
    return clone(updated);
  }

  async findExpiredInProgress(now, limit = 100) {
    const cutoff = new Date(now).getTime();
    return Array.from(this._attempts.values())
      .filter((attempt) => attempt.status === 'in_progress' && new Date(attempt.expiresAt).getTime() <= cutoff)
      .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      .slice(0, limit)
      .map(clone);
  }

  async deleteByExam(examId) {
    const matching = [...this._attempts.values()].filter((attempt) => attempt.examId === examId);
    matching.forEach((attempt) => this._attempts.delete(attempt.id));
    return matching.length;
  }

  clear() {
    this._attempts.clear();
  }
}
