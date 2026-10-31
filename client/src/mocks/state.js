import { gradeAttempt } from './grading';
import { buildQuestionSet, createInitialState, STORAGE_KEY } from './seed';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.sessionStorage);

const loadState = () => {
  if (!canUseStorage()) return createInitialState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (parsed.__version !== 1) return createInitialState();
    return {
      ...createInitialState(),
      ...parsed,
      // These are troubleshooting toggles, not durable exam data.
      offline: false,
      failNextSave: false,
      serverClockOffsetMs: 0,
    };
  } catch {
    return createInitialState();
  }
};

export const state = loadState();

export const persist = () => {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        offline: false,
        failNextSave: false,
        serverClockOffsetMs: 0,
      }),
    );
  } catch {
    // Storage can be full or disabled; the in-memory mock still works.
  }
};

export const resetState = () => {
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, createInitialState());
  if (canUseStorage()) window.sessionStorage.removeItem(STORAGE_KEY);
  persist();
};

export const newId = () =>
  Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export const getServerNow = () => new Date(Date.now() + state.serverClockOffsetMs);
export const serverNowIso = () => getServerNow().toISOString();

export const findUser = (id) => state.users.find((user) => user.id === id);
export const getCurrentUser = () => findUser(state.currentUserId);
export const findQuestion = (id) => state.questions.find((question) => question.id === id);
export const findExam = (id) => state.exams.find((exam) => exam.id === id);
export const findAttempt = (id) => state.attempts.find((attempt) => attempt.id === id);

export const publicUser = (user) => {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
};

export const isStudentEligible = (exam, studentId) => {
  const student = findUser(studentId);
  if (!student || student.role !== 'student') return false;
  const joined = state.joinedExamIdsByStudent[studentId] || [];
  return joined.includes(exam.id) || exam.assignment.batchIds.some((batchId) => student.batchIds.includes(batchId));
};

export const examPhase = (exam, now = getServerNow()) => {
  if (exam.status === 'draft') return 'draft';
  const time = now.getTime();
  if (time < new Date(exam.startAt).getTime()) return 'upcoming';
  if (time >= new Date(exam.endAt).getTime()) return 'ended';
  return 'live';
};

export const resultAvailability = (exam, attempt, now = getServerNow()) => {
  if (!attempt || attempt.status !== 'submitted') return { available: false, at: null };
  if (exam.resultsReleasedAt && new Date(exam.resultsReleasedAt) <= now) {
    return { available: true, at: exam.resultsReleasedAt };
  }
  if (exam.resultMode === 'immediate') {
    return { available: true, at: attempt.submittedAt };
  }
  if (exam.resultMode === 'after_end' && now >= new Date(exam.endAt)) {
    return { available: true, at: exam.endAt };
  }
  return {
    available: false,
    at: exam.resultsReleasedAt || (exam.resultMode === 'after_end' ? exam.endAt : null),
  };
};

export const resultReleaseAt = (exam, attempt, now = getServerNow()) => {
  if (exam.resultsReleasedAt) return exam.resultsReleasedAt;
  if (exam.resultMode === 'after_end') return exam.endAt;
  if (exam.resultMode === 'immediate') return attempt?.submittedAt || null;
  return null;
};

export const toStudentItem = (item) => ({
  id: item.id,
  order: item.order,
  marks: item.marks,
  negativeMarks: item.negativeMarks,
  question: {
    subject: item.question.subject,
    topic: item.question.topic,
    difficulty: item.question.difficulty,
    prompt: item.question.prompt,
    type: item.question.type,
    options: item.question.options,
  },
});

export const examSummary = (exam, now = getServerNow()) => ({
  id: exam.id,
  title: exam.title,
  description: exam.description,
  durationMinutes: exam.durationMinutes,
  startAt: exam.startAt,
  endAt: exam.endAt,
  status: exam.status,
  phase: examPhase(exam, now),
  resultMode: exam.resultMode,
  assignment: exam.assignment,
  joinCode: exam.joinCode,
  itemCount: exam.items.length,
  totalMarks: exam.items.reduce((sum, item) => sum + Number(item.marks || 0), 0),
  createdBy: exam.createdBy,
  publishedAt: exam.publishedAt,
  resultsReleasedAt: exam.resultsReleasedAt,
  createdAt: exam.createdAt,
  updatedAt: exam.updatedAt,
});

export const toStudentExamMeta = (exam, attempt, now = getServerNow()) => {
  const availability = examPhase(exam, now);
  const release = attempt ? resultAvailability(exam, attempt, now) : { available: false, at: null };
  const resultAvailable = Boolean(attempt?.status === 'submitted' && release.available);
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
    score: resultAvailable ? attempt.score : null,
    percentage: resultAvailable ? attempt.percentage : null,
    passed: resultAvailable ? attempt.passed : null,
    itemCount: exam.items.length,
    totalMarks: exam.items.reduce((sum, item) => sum + Number(item.marks || 0), 0),
    policy: {
      passPercentage: exam.settings.passPercentage,
      violationLimit: exam.settings.violationLimit,
      autoSubmitOnViolation: exam.settings.autoSubmitOnViolation,
    },
  };
};

export const finalizeAttempt = (attempt, reason = 'expiry', submittedAt = serverNowIso()) => {
  if (!attempt || attempt.status !== 'in_progress') return attempt;
  const exam = findExam(attempt.examId);
  if (!exam) return attempt;
  const grade = gradeAttempt(attempt.questionSet, attempt.answers, exam.settings.passPercentage);
  attempt.status = 'submitted';
  attempt.submittedAt = submittedAt;
  attempt.finalizedBy = reason;
  attempt.score = grade.score;
  attempt.maxScore = grade.maxScore;
  attempt.percentage = grade.percentage;
  attempt.passed = grade.passed;
  attempt.timeTakenSeconds = Math.min(
    Math.max(0, Math.round((new Date(submittedAt) - new Date(attempt.startedAt)) / 1000)),
    exam.durationMinutes * 60,
  );
  persist();
  return attempt;
};

export const ensureNotExpired = (attempt, exam, now = getServerNow()) => {
  if (attempt?.status === 'in_progress' && new Date(attempt.expiresAt) <= now) {
    finalizeAttempt(attempt, 'expiry', now.toISOString());
  }
  return attempt;
};

export const attemptState = (attempt, exam) => ({
  attemptId: attempt.id,
  exam: {
    id: exam.id,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    resultMode: exam.resultMode,
    resultReleaseAt: resultReleaseAt(exam, attempt),
    passPercentage: exam.settings.passPercentage,
    violationPolicy: {
      maxViolations: exam.settings.violationLimit,
      autoSubmit: exam.settings.autoSubmitOnViolation,
    },
  },
  status: attempt.status,
  startedAt: attempt.startedAt,
  expiresAt: attempt.expiresAt,
  serverTime: serverNowIso(),
  maxScore: attempt.questionSet.reduce((sum, item) => sum + Number(item.marks || 0), 0),
  violationCount: attempt.violationEvents.length,
  questions: attempt.questionSet.map(toStudentItem),
  savedAnswers: Object.values(attempt.answers),
});

export const submittedSummary = (attempt, exam) => {
  const release = resultAvailability(exam, attempt);
  return {
    attemptId: attempt.id,
    status: 'submitted',
    submittedAt: attempt.submittedAt,
    serverTime: serverNowIso(),
    resultAvailable: release.available,
    resultReleaseAt: release.at,
  };
};

export const toResult = (attempt, exam, { forStudent = false } = {}) => {
  const grade = gradeAttempt(attempt.questionSet, attempt.answers, exam.settings.passPercentage);
  const result = {
    attemptId: attempt.id,
    exam: { id: exam.id, title: exam.title },
    status: 'submitted',
    submittedAt: attempt.submittedAt,
    score: grade.score,
    maxScore: grade.maxScore,
    percentage: grade.percentage,
    passPercentage: exam.settings.passPercentage,
    passed: grade.passed,
    timeTakenSeconds: attempt.timeTakenSeconds ?? 0,
    violationCount: attempt.violationEvents.length,
    items: grade.items,
  };

  if (forStudent) {
    const history = state.attempts
      .filter((entry) => entry.studentId === attempt.studentId && entry.status === 'submitted')
      .map((entry) => {
        const entryExam = findExam(entry.examId);
        const availability = entryExam ? resultAvailability(entryExam, entry) : { available: false };
        if (!entryExam || !availability.available) return null;
        return {
          examId: entryExam.id,
          examTitle: entryExam.title,
          percentage: entry.percentage,
          submittedAt: entry.submittedAt,
        };
      })
      .filter(Boolean)
      .sort((left, right) => new Date(left.submittedAt) - new Date(right.submittedAt))
      .slice(-10);
    result.scoreHistory = history;
  } else {
    result.student = publicUser(findUser(attempt.studentId));
  }

  return result;
};

export const answerCount = (attempt) => Object.keys(attempt.answers || {}).length;

export const lastActivityAt = (attempt) => {
  const answerTimes = Object.values(attempt.answers || {}).map((answer) => answer.updatedAt);
  const violationTimes = (attempt.violationEvents || []).map((event) => event.occurredAt);
  const times = [...answerTimes, ...violationTimes, attempt.startedAt].filter(Boolean);
  return times.sort().at(-1) || attempt.startedAt;
};

export const eligibleStudents = (exam) => {
  const joinedIds = Object.entries(state.joinedExamIdsByStudent)
    .filter(([, examIds]) => examIds.includes(exam.id))
    .map(([studentId]) => studentId);
  return state.users.filter(
    (user) =>
      user.role === 'student' &&
      user.isActive &&
      (joinedIds.includes(user.id) || exam.assignment.batchIds.some((batchId) => user.batchIds.includes(batchId))),
  );
};

export const batchOptions = () => {
  const ids = [...new Set(state.users.flatMap((user) => user.batchIds || []))].sort();
  return ids.map((id) => ({ id, name: id.replace('-', ' ') }));
};

export const userSummary = (users) => ({
  total: users.length,
  active: users.filter((user) => user.isActive).length,
  inactive: users.filter((user) => !user.isActive).length,
  roleCounts: {
    admin: users.filter((user) => user.role === 'admin').length,
    teacher: users.filter((user) => user.role === 'teacher').length,
    student: users.filter((user) => user.role === 'student').length,
  },
});

export const examSummaryCounts = (exams) => {
  const now = getServerNow();
  return {
    total: exams.length,
    draft: exams.filter((exam) => exam.status === 'draft').length,
    published: exams.filter((exam) => exam.status === 'published').length,
    upcoming: exams.filter((exam) => exam.status === 'published' && examPhase(exam, now) === 'upcoming').length,
    live: exams.filter((exam) => exam.status === 'published' && examPhase(exam, now) === 'live').length,
    ended: exams.filter((exam) => exam.status === 'published' && examPhase(exam, now) === 'ended').length,
  };
};

export const questionFacets = (questions) => ({
  subjects: [...new Set(questions.map((question) => question.subject))].sort(),
  topics: [...new Set(questions.map((question) => question.topic))].sort(),
});

export { buildQuestionSet };
