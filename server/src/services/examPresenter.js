import { examPhase } from '../utils/examTime.js';

export const nowIso = () => new Date().toISOString();

/** Policy time at which a sealed result becomes visible (null = manual release). */
export const resultReleaseAt = (exam, attempt) => {
  if (exam.resultsReleasedAt) return exam.resultsReleasedAt;
  if (exam.resultMode === 'after_end') return exam.endAt;
  if (exam.resultMode === 'immediate') return attempt?.submittedAt || null;
  return null;
};

export const resultAvailability = (exam, attempt, now = new Date()) => {
  if (!attempt || attempt.status !== 'submitted') return { available: false, at: null };
  if (exam.resultsReleasedAt && new Date(exam.resultsReleasedAt) <= now) {
    return { available: true, at: exam.resultsReleasedAt };
  }
  if (exam.resultMode === 'immediate') {
    return { available: true, at: attempt.submittedAt };
  }
  if (exam.resultMode === 'after_end' && now.getTime() >= new Date(exam.endAt).getTime()) {
    return { available: true, at: exam.endAt };
  }
  return {
    available: false,
    at: exam.resultsReleasedAt || (exam.resultMode === 'after_end' ? exam.endAt : null),
  };
};

/** Teacher/admin representation, including items and answer keys. */
export const teacherExam = (exam, now = new Date()) => ({
  id: exam.id,
  title: exam.title,
  description: exam.description,
  durationMinutes: exam.durationMinutes,
  startAt: exam.startAt,
  endAt: exam.endAt,
  status: exam.status,
  phase: examPhase(exam, now),
  resultMode: exam.resultMode,
  settings: { ...exam.settings },
  assignment: { ...exam.assignment, batchIds: [...exam.assignment.batchIds] },
  joinCode: exam.joinCode,
  items: exam.items.map((item) => ({
    id: item.id,
    questionId: item.questionId,
    order: item.order,
    marks: item.marks,
    negativeMarks: item.negativeMarks,
    questionSnapshot: item.questionSnapshot ? structuredClone(item.questionSnapshot) : null,
  })),
  totalMarks: exam.totalMarks,
  createdBy: exam.createdBy,
  publishedAt: exam.publishedAt,
  resultsReleasedAt: exam.resultsReleasedAt,
  createdAt: exam.createdAt,
  updatedAt: exam.updatedAt,
});

/** List row: no item payload, just counts. */
export const examListRow = (exam, now = new Date()) => ({
  id: exam.id,
  title: exam.title,
  description: exam.description,
  durationMinutes: exam.durationMinutes,
  startAt: exam.startAt,
  endAt: exam.endAt,
  status: exam.status,
  phase: examPhase(exam, now),
  resultMode: exam.resultMode,
  settings: { ...exam.settings },
  assignment: { ...exam.assignment, batchIds: [...exam.assignment.batchIds] },
  joinCode: exam.joinCode,
  itemCount: exam.items.length,
  totalMarks: exam.totalMarks,
  createdBy: exam.createdBy,
  publishedAt: exam.publishedAt,
  resultsReleasedAt: exam.resultsReleasedAt,
  createdAt: exam.createdAt,
  updatedAt: exam.updatedAt,
});

/** Student-facing metadata: never includes items, questions, keys, or batches. */
export const studentExamMeta = (exam, attempt, now = new Date()) => {
  const settings = exam.settings || {};
  const availability = examPhase(exam, now);
  const release = resultAvailability(exam, attempt, now);
  const resultAvailable = Boolean(attempt?.status === 'submitted' && release.available);
  const grade = attempt?.gradedPayload;
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    durationMinutes: exam.durationMinutes,
    startAt: exam.startAt,
    endAt: exam.endAt,
    availability,
    attemptStatus: attempt?.status || null,
    attemptId: attempt?.id || null,
    canStart: availability === 'live' && !attempt,
    canResume: attempt?.status === 'in_progress',
    resultAvailable,
    score: resultAvailable ? grade?.score ?? null : null,
    percentage: resultAvailable ? grade?.percentage ?? null : null,
    passed: resultAvailable ? grade?.passed ?? null : null,
    itemCount: exam.items.length,
    totalMarks: exam.totalMarks,
    policy: {
      passPercentage: settings.passPercentage ?? 40,
      violationLimit: settings.violationLimit ?? 0,
      autoSubmitOnViolation: settings.autoSubmitOnViolation ?? false,
    },
  };
};

/** Strip every answer-key field before an item leaves the server. */
export const studentItem = (item) => ({
  id: item.id,
  order: item.order,
  marks: item.marks,
  negativeMarks: item.negativeMarks,
  question: {
    prompt: item.question.prompt,
    type: item.question.type,
    options: (item.question.options || []).map((option) => ({ id: option.id, text: option.text })),
  },
});

export const attemptState = (attempt, exam, now = new Date()) => {
  const settings = exam.settings || {};
  return {
    attemptId: attempt.id,
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      resultMode: exam.resultMode,
      resultReleaseAt: resultReleaseAt(exam, attempt),
      passPercentage: settings.passPercentage ?? 40,
      violationPolicy: {
        maxViolations: settings.violationLimit ?? 0,
        autoSubmit: settings.autoSubmitOnViolation ?? false,
      },
    },
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    serverTime: now.toISOString(),
    maxScore: attempt.questionSet.reduce((sum, item) => sum + Number(item.marks || 0), 0),
    violationCount: attempt.violations.length,
    questions: attempt.questionSet.map(studentItem),
    savedAnswers: Object.values(attempt.answers),
  };
};

export const submittedSummary = (attempt, exam, now = new Date()) => {
  const release = resultAvailability(exam, attempt, now);
  return {
    attemptId: attempt.id,
    status: 'submitted',
    submittedAt: attempt.submittedAt,
    serverTime: now.toISOString(),
    resultAvailable: release.available,
    resultReleaseAt: release.at,
  };
};

export const resultPayload = (attempt, exam, { forStudent = false } = {}) => {
  const grade = attempt.gradedPayload;
  const payload = {
    attemptId: attempt.id,
    exam: { id: exam.id, title: exam.title },
    status: 'submitted',
    submittedAt: attempt.submittedAt,
    score: grade.score,
    maxScore: grade.maxScore,
    percentage: grade.percentage,
    passPercentage: exam.settings?.passPercentage ?? 40,
    passed: grade.passed,
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    violationCount: attempt.violations.length,
    items: grade.items,
  };
  if (forStudent) {
    payload.scoreHistory = [];
  }
  return payload;
};

export const monitorRow = (student, attempt) => ({
  attemptId: attempt?.id || null,
  student: { id: student.id, name: student.name, email: student.email },
  status: attempt?.status || 'not_started',
  startedAt: attempt?.startedAt || null,
  expiresAt: attempt?.expiresAt || null,
  submittedAt: attempt?.submittedAt || null,
  answerCount: attempt ? Object.keys(attempt.answers).length : 0,
  violationCount: attempt?.violations.length || 0,
  violationSummary: violationSummary(attempt),
  violations: (attempt?.violations || []).map((violation) => ({
    type: violation.type,
    source: violation.source || 'client',
    meta: violation.meta || {},
    occurredAt: violation.occurredAt,
  })),
  lastActivityAt: attempt ? lastActivityAt(attempt) : null,
});

const violationSummary = (attempt) =>
  (attempt?.violations || []).reduce((summary, violation) => {
    summary[violation.type] = (summary[violation.type] || 0) + 1;
    return summary;
  }, {});

const lastActivityAt = (attempt) => {
  const times = [
    ...Object.values(attempt.answers).map((answer) => answer.updatedAt),
    ...attempt.violations.map((violation) => violation.occurredAt),
    attempt.startedAt,
  ].filter(Boolean);
  return times.sort((left, right) => new Date(left).getTime() - new Date(right).getTime()).at(-1) || attempt.startedAt;
};

export const resultRow = (student, attempt) => ({
  attemptId: attempt.id,
  student: { id: student.id, name: student.name, email: student.email },
  status: 'submitted',
  score: attempt.gradedPayload.score,
  maxScore: attempt.gradedPayload.maxScore,
  percentage: attempt.gradedPayload.percentage,
  passed: attempt.gradedPayload.passed,
  submittedAt: attempt.submittedAt,
  timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
  violationCount: attempt.violations.length,
});
