import { newId, nowIso } from '../../utils/ids.js';

const clone = (value) => structuredClone(value);

export const computeTimeTakenSeconds = (startedAt, submittedAt, durationMinutes = 0) => {
  if (!startedAt || !submittedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(submittedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  const elapsed = Math.max(0, Math.round((endMs - startMs) / 1000));
  const capSeconds = Math.max(0, Number(durationMinutes) || 0) * 60;
  return capSeconds > 0 ? Math.min(elapsed, capSeconds) : elapsed;
};

const makeAttempt = (input) => {
  const status = input.status === 'submitted' ? 'submitted' : 'in_progress';
  const submittedAt = input.submittedAt || null;
  const computedTimeTaken =
    input.timeTakenSeconds !== undefined && input.timeTakenSeconds !== null
      ? input.timeTakenSeconds
      : status === 'submitted' && submittedAt
        ? computeTimeTakenSeconds(
            input.startedAt,
            submittedAt,
            input.examSnapshot?.durationMinutes,
          )
        : null;

  return {
    id: input.id || newId(),
    examId: input.examId,
    studentId: input.studentId,
    status,
    startedAt: input.startedAt,
    expiresAt: input.expiresAt,
    submittedAt,
    questionSet: clone(input.questionSet || []),
    examSnapshot: clone(input.examSnapshot || {}),
    answers: clone(input.answers || {}),
    violations: clone(input.violations || []),
    clientSession: clone(
      input.clientSession || {
        ip: null,
        userAgent: null,
        lastHeartbeatAt: input.startedAt || null,
        lastAnswerAt: null,
      },
    ),
    gradedPayload: input.gradedPayload || null,
    finalizedBy: input.finalizedBy || null,
    timeTakenSeconds: computedTimeTaken,
  };
};

/**
 * In-memory attempt repository.
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
    if (existing.length >= maxAttempts) {
      return { attempt: null, created: false, reason: 'max_attempts' };
    }

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
    const matching = Array.from(this._attempts.values()).filter(
      (entry) => entry.examId === examId && entry.studentId === studentId,
    );
    const attempt = matching.at(-1);
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

    const stored = {
      itemId,
      selectedOptionIds: [...(answer.selectedOptionIds || [])],
      numericValue: answer.numericValue ?? null,
      markedForReview: Boolean(answer.markedForReview),
      clientSeq,
      updatedAt: now,
    };
    attempt.answers[itemId] = stored;
    attempt.clientSession = {
      ...(attempt.clientSession || {}),
      lastAnswerAt: now,
      lastHeartbeatAt: now,
    };
    return clone(stored);
  }

  async updateClientContext(id, patch) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;
    attempt.clientSession = {
      ...(attempt.clientSession || {}),
      ...patch,
    };
    return clone(attempt);
  }

  async recordViolation(id, violation, { cap = 100 } = {}) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;
    const entry = {
      type: violation.type,
      source: violation.source || 'client',
      meta: clone(violation.meta || {}),
      occurredAt: violation.occurredAt || nowIso(),
    };
    attempt.violations = [...attempt.violations, entry].slice(-cap);
    return clone(attempt);
  }

  async finalizeIfInProgress(id, gradedPayload, { submittedAt, finalizedBy = 'submit' } = {}) {
    const attempt = this._attempts.get(id);
    if (!attempt || attempt.status !== 'in_progress') return null;

    const endedAt = submittedAt || nowIso();
    const timeTakenSeconds = computeTimeTakenSeconds(
      attempt.startedAt,
      endedAt,
      attempt.examSnapshot?.durationMinutes,
    );
    const updated = {
      ...attempt,
      status: 'submitted',
      submittedAt: endedAt,
      gradedPayload: clone(gradedPayload),
      finalizedBy,
      timeTakenSeconds,
    };
    this._attempts.set(id, updated);
    return clone(updated);
  }

  async findExpiredInProgress(now, limit = 100) {
    const cutoff = new Date(now).getTime();
    return Array.from(this._attempts.values())
      .filter(
        (attempt) =>
          attempt.status === 'in_progress' && new Date(attempt.expiresAt).getTime() <= cutoff,
      )
      .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
      .slice(0, limit)
      .map(clone);
  }

  async findExpiredInProgressByExam(examId, now) {
    const cutoff = new Date(now).getTime();
    return Array.from(this._attempts.values())
      .filter(
        (attempt) =>
          attempt.examId === examId &&
          attempt.status === 'in_progress' &&
          new Date(attempt.expiresAt).getTime() <= cutoff,
      )
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
