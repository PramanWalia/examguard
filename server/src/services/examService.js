import { AppError, forbidden, notFound } from '../utils/errors.js';
import { escapeCsvCell, slugify } from '../utils/csv.js';
import { examPhase } from '../utils/examTime.js';
import { newId } from '../utils/ids.js';
import { paginate } from '../utils/pagination.js';
import { shuffle } from '../utils/shuffle.js';
import { examScheduleSchema, examSchema } from '../validators/exam.js';
import { parseInput } from '../validators/common.js';
import { gradeAttempt } from './grading.js';
import {
  attemptState,
  examListRow,
  monitorRow,
  resultAvailability,
  resultPayload,
  resultRow,
  studentExamMeta,
  submittedSummary,
  teacherExam,
} from './examPresenter.js';

const fail = (status, code, message, details) => new AppError(status, code, message, details);

const nowIso = () => new Date().toISOString();
const ANSWER_SAVE_GRACE_MS = 5_000;

const gradeOptions = (exam) => {
  const settings = exam.settings || {};
  return {
    passPercentage: settings.passPercentage ?? 40,
    partialMarking: settings.partialMarking ?? false,
    numericTolerance: settings.numericTolerance ?? 1e-9,
  };
};

const loadExam = async (examRepo, id) => {
  const exam = await examRepo.findById(id);
  if (!exam) throw notFound('Exam not found.');
  return exam;
};

const assertExamOwner = (user, exam) => {
  if (user.role !== 'admin' && exam.createdBy !== user.id) {
    throw forbidden('This exam belongs to another teacher.');
  }
};

const isEligible = async (userRepo, exam, studentId) => {
  const batchIds = exam.assignment?.batchIds || [];
  if (!batchIds.length) {
    return (await userRepo.getJoinedExamIds(studentId)).includes(exam.id);
  }
  const student = await userRepo.findById(studentId);
  const joined = (await userRepo.getJoinedExamIds(studentId)).includes(exam.id);
  return joined || Boolean(student?.batchIds?.some((batchId) => batchIds.includes(batchId)));
};

const snapshotOf = (question) => ({
  subject: question.subject,
  topic: question.topic,
  difficulty: question.difficulty,
  type: question.type,
  prompt: question.prompt,
  options: question.options.map((option) => ({ ...option })),
  correctOptionIds: [...question.correctOptionIds],
  numericAnswer: question.numericAnswer,
  explanation: question.explanation,
});

/**
 * Resolve every referenced question and enforce "teachers use their own bank".
 * Returns repository-ready items plus the questions for the publish snapshot.
 */
const resolveQuestions = async (questionRepo, user, items) => {
  const questions = await questionRepo.findByIds(items.map((item) => String(item.questionId)));
  const byId = new Map(questions.map((question) => [String(question.id), question]));
  return items.map((item, index) => {
    const question = byId.get(String(item.questionId));
    if (!question) throw notFound('One of the selected questions no longer exists.');
    if (user.role !== 'admin' && question.createdBy !== user.id) {
      throw forbidden('You can only use your own questions.');
    }
    return {
      id: item.id || newId(),
      questionId: String(question.id),
      order: index + 1,
      marks: item.marks ?? question.defaultMarks,
      negativeMarks: item.negativeMarks ?? question.negativeMarks,
      questionSnapshot: item.questionSnapshot || null,
      question,
    };
  });
};

const buildQuestionSet = (exam) => {
  if (exam.items.some((item) => !item.questionSnapshot)) {
    throw fail(409, 'INVALID_STATE', 'This exam has no published question snapshots.');
  }
  const settings = exam.settings || {};
  const items = exam.items.map((item) => ({
    id: item.id,
    questionId: item.questionId,
    order: item.order,
    marks: item.marks,
    negativeMarks: item.negativeMarks,
    question: structuredClone(item.questionSnapshot),
  }));
  const ordered = settings.shuffleQuestions ? shuffle(items) : items;
  return ordered.map((item) => ({
    ...item,
    question: {
      ...item.question,
      options: settings.shuffleOptions ? shuffle(item.question.options || []) : item.question.options || [],
    },
  }));
};

/** Lazy finalization used by every read/write path. */
const finalizeExpired = async (attemptRepo, attempt, exam, now = new Date()) => {
  if (!attempt || attempt.status !== 'in_progress') return attempt;
  if (new Date(attempt.expiresAt).getTime() > now.getTime()) return attempt;
  const graded = gradeAttempt(attempt.questionSet, attempt.answers, gradeOptions(exam));
  const updated = await attemptRepo.finalizeIfInProgress(attempt.id, graded, {
    submittedAt: attempt.expiresAt,
    finalizedBy: 'expiry',
  });
  return updated || (await attemptRepo.findById(attempt.id));
};

const finalizeExpiredForExam = async (repos, exam, now = new Date()) => {
  const attempts = await repos.attemptRepo.listByExam(exam.id);
  await Promise.all(attempts.map((attempt) => finalizeExpired(repos.attemptRepo, attempt, exam, now)));
};

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export const createExam = async (repos, user, input) => {
  const resolved = await resolveQuestions(repos.questionRepo, user, input.items);
  const exam = await repos.examRepo.create({
    ...input,
    status: 'draft',
    items: resolved.map((item) => ({
      id: item.id,
      questionId: item.questionId,
      order: item.order,
      marks: item.marks,
      negativeMarks: item.negativeMarks,
      questionSnapshot: null,
    })),
    createdBy: user.id,
  });
  return teacherExam(exam);
};

export const listExams = async (repos, user, query) => {
  const { data, meta } = await repos.examRepo.list({
    ...(user.role === 'admin' ? {} : { createdBy: user.id }),
    ...query,
  });
  return { data: data.map((exam) => examListRow(exam)), meta };
};

export const availableExams = async (repos, user, query) => {
  const now = new Date();
  const exams = (await repos.examRepo.list({ status: 'published', page: 1, limit: 100 })).data;

  const rows = [];
  for (const exam of exams) {
    if (!(await isEligible(repos.userRepo, exam, user.id))) continue;
    let attempt = await repos.attemptRepo.findByExamAndStudent(exam.id, user.id);
    attempt = await finalizeExpired(repos.attemptRepo, attempt, exam, now);
    const meta = studentExamMeta(exam, attempt, now);
    if (query.scope === 'past' && meta.availability !== 'ended' && meta.attemptStatus !== 'submitted') continue;
    if (query.scope === 'live' && (meta.availability !== 'live' || meta.attemptStatus === 'submitted')) continue;
    if (query.scope === 'upcoming' && meta.availability !== 'upcoming') continue;
    rows.push(meta);
  }
  rows.sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());

  const { data, meta } = paginate(rows, query.page, query.limit);
  return { data, meta: { ...meta, serverTime: nowIso() } };
};

export const getExam = async (repos, user, id) => {
  const exam = await loadExam(repos.examRepo, id);
  if (user.role === 'student') {
    if (exam.status !== 'published' || !(await isEligible(repos.userRepo, exam, user.id))) {
      throw forbidden('This exam is not assigned to you.');
    }
    const attempt = await finalizeExpired(
      repos.attemptRepo,
      await repos.attemptRepo.findByExamAndStudent(exam.id, user.id),
      exam,
    );
    return studentExamMeta(exam, attempt);
  }
  assertExamOwner(user, exam);
  return teacherExam(exam);
};

export const updateExam = async (repos, user, id, patch) => {
  const exam = await loadExam(repos.examRepo, id);
  assertExamOwner(user, exam);
  if (exam.status === 'published') {
    const allowed = ['startAt', 'endAt'];
    if (Object.keys(patch).some((key) => !allowed.includes(key))) {
      throw fail(409, 'INVALID_STATE', 'Published exams only allow schedule changes.');
    }
    const mergedSchedule = parseInput(examScheduleSchema, {
      startAt: patch.startAt ?? exam.startAt,
      endAt: patch.endAt ?? exam.endAt,
    });
    const updated = await repos.examRepo.updateById(id, mergedSchedule);
    if (!updated) throw notFound('Exam not found.');
    return teacherExam(updated);
  }

  let items = exam.items;
  if (patch.items !== undefined) {
    const resolved = await resolveQuestions(repos.questionRepo, user, patch.items);
    items = resolved.map((item) => ({
      id: item.id,
      questionId: item.questionId,
      order: item.order,
      marks: item.marks,
      negativeMarks: item.negativeMarks,
      questionSnapshot: null,
    }));
  }

  // Full validation after the merge: a partial patch must not leave timing,
  // marks, or assignment in an invalid combination.
  const merged = parseInput(examSchema, {
    title: patch.title ?? exam.title,
    description: patch.description ?? exam.description,
    durationMinutes: patch.durationMinutes ?? exam.durationMinutes,
    startAt: patch.startAt ?? exam.startAt,
    endAt: patch.endAt ?? exam.endAt,
    resultMode: patch.resultMode ?? exam.resultMode,
    settings: { ...exam.settings, ...(patch.settings || {}) },
    assignment: { ...exam.assignment, ...(patch.assignment || {}) },
    items: items.map(({ questionId, marks, negativeMarks }) => ({ questionId, marks, negativeMarks })),
  });

  const updateFn = repos.examRepo.updateDraftById
    ? repos.examRepo.updateDraftById.bind(repos.examRepo)
    : repos.examRepo.updateById.bind(repos.examRepo);

  const updated = await updateFn(id, {
    ...merged,
    items: items.map((item) => ({
      id: item.id,
      questionId: item.questionId,
      order: item.order,
      marks: item.marks,
      negativeMarks: item.negativeMarks,
      questionSnapshot: item.questionSnapshot,
    })),
  });
  if (!updated) throw fail(409, 'INVALID_STATE', 'Exam was published or no longer available as a draft.');
  return teacherExam(updated);
};

export const deleteExam = async (repos, user, id) => {
  const exam = await loadExam(repos.examRepo, id);
  assertExamOwner(user, exam);
  await repos.attemptRepo.deleteByExam(exam.id);
  const deleted = await repos.examRepo.deleteById(exam.id);
  if (!deleted) throw notFound('Exam not found.');
  return { id: deleted.id, deleted: true };
};

export const publishExam = async (repos, user, id) => {
  const exam = await loadExam(repos.examRepo, id);
  assertExamOwner(user, exam);
  if (exam.status === 'published') throw fail(409, 'INVALID_STATE', 'This exam is already published.');
  if (!exam.items.length) throw fail(409, 'INVALID_STATE', 'Add at least one question before publishing.');

  const resolved = await resolveQuestions(repos.questionRepo, user, exam.items);
  const prepared = {
    items: resolved.map((item) => ({
      id: item.id,
      questionId: item.questionId,
      order: item.order,
      marks: item.marks,
      negativeMarks: item.negativeMarks,
      questionSnapshot: snapshotOf(item.question),
    })),
    totalMarks: resolved.reduce((sum, item) => sum + Number(item.marks), 0),
  };
  const published = await repos.examRepo.publish(id, exam.createdBy, prepared);
  if (!published) throw fail(409, 'INVALID_STATE', 'This exam cannot be published in its current state.');
  return {
    id: published.id,
    status: published.status,
    joinCode: published.joinCode,
    publishedAt: published.publishedAt,
  };
};

export const joinExam = async (repos, user, joinCode) => {
  const exam = await repos.examRepo.findByJoinCode(joinCode);
  if (!exam) throw notFound('No exam matches that join code.');
  if (exam.status !== 'published' || !exam.assignment?.joinCodeEnabled) {
    throw fail(403, 'EXAM_NOT_LIVE', 'This exam is not accepting join codes.');
  }
  if (examPhase(exam) === 'ended') throw fail(403, 'EXAM_NOT_LIVE', 'This exam has already ended.');

  await repos.userRepo.addJoinedExam(user.id, exam.id);
  const attempt = await finalizeExpired(
    repos.attemptRepo,
    await repos.attemptRepo.findByExamAndStudent(exam.id, user.id),
    exam,
  );
  return studentExamMeta(exam, attempt);
};

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export const startAttempt = async (repos, user, examId) => {
  const exam = await loadExam(repos.examRepo, examId);
  if (exam.status !== 'published' || examPhase(exam) !== 'live') {
    throw fail(403, 'EXAM_NOT_LIVE', 'This exam is not live right now.');
  }
  if (!(await isEligible(repos.userRepo, exam, user.id))) {
    throw forbidden('This exam is not assigned to you.');
  }

  const existing = await finalizeExpired(
    repos.attemptRepo,
    await repos.attemptRepo.findByExamAndStudent(exam.id, user.id),
    exam,
  );
  if (existing) {
    if (existing.status === 'submitted') throw fail(409, 'ALREADY_ATTEMPTED', 'You have already submitted this exam.');
    return { attempt: existing, exam, created: false };
  }

  const now = new Date();
  const startedAt = now.toISOString();
  const expiresAt = new Date(
    Math.min(now.getTime() + exam.durationMinutes * 60_000, new Date(exam.endAt).getTime()),
  ).toISOString();

  const { attempt, created, reason } = await repos.attemptRepo.createIfNoActive(
    exam.id,
    user.id,
    {
      status: 'in_progress',
      startedAt,
      expiresAt,
      submittedAt: null,
      questionSet: buildQuestionSet(exam),
      examSnapshot: {
        id: exam.id,
        title: exam.title,
        durationMinutes: exam.durationMinutes,
        endAt: exam.endAt,
        resultMode: exam.resultMode,
      },
      answers: {},
      violations: [],
    },
    { maxAttempts: exam.settings?.maxAttempts ?? 1 },
  );

  if (!created) {
    if (reason === 'in_progress' && attempt) return { attempt, exam, created: false };
    throw fail(409, 'ALREADY_ATTEMPTED', 'You have already attempted this exam.');
  }
  return { attempt, exam, created: true };
};

export const saveAnswer = async (repos, user, attemptId, body) => {
  let attempt = await repos.attemptRepo.findByIdAndStudent(attemptId, user.id);
  if (!attempt) {
    // Distinguish "not yours" (403) from "does not exist" (404).
    const any = await repos.attemptRepo.findById(attemptId);
    if (!any) throw notFound('Attempt not found.');
    throw forbidden('This attempt belongs to another student.');
  }
  const exam = await loadExam(repos.examRepo, attempt.examId);
  const now = new Date();
  const expiryTime = new Date(attempt.expiresAt).getTime();
  const withinGrace =
    attempt.status === 'in_progress' &&
    now.getTime() > expiryTime &&
    now.getTime() - expiryTime <= ANSWER_SAVE_GRACE_MS;
  // A request already in flight at the deadline gets a short delivery grace
  // period; after that, expiry is finalized before any answer validation.
  if (!withinGrace) attempt = await finalizeExpired(repos.attemptRepo, attempt, exam, now);
  if (attempt.status !== 'in_progress') {
    throw attempt.finalizedBy === 'expiry'
      ? fail(409, 'ATTEMPT_EXPIRED', 'This attempt is no longer accepting answers.')
      : fail(409, 'INVALID_STATE', 'This attempt is no longer accepting answers.');
  }

  const item = attempt.questionSet.find((entry) => entry.id === body.itemId);
  if (!item) throw notFound('That question does not belong to this attempt.');

  if (body.selectedOptionIds !== undefined) {
    const optionIds = new Set((item.question.options || []).map((option) => option.id));
    if (item.question.type === 'numeric' && body.selectedOptionIds.length > 0) {
      throw fail(400, 'VALIDATION_ERROR', 'Numeric questions accept a number, not options.');
    }
    if (item.question.type === 'single_choice' && body.selectedOptionIds.length > 1) {
      throw fail(400, 'VALIDATION_ERROR', 'Single choice accepts one option.');
    }
    if (!body.selectedOptionIds.every((id) => optionIds.has(id))) {
      throw fail(400, 'VALIDATION_ERROR', 'That option does not belong to this question.');
    }
  }
  if (body.numericValue !== undefined && body.numericValue !== null && item.question.type !== 'numeric') {
    throw fail(400, 'VALIDATION_ERROR', 'This is not a numeric question.');
  }

  const previous = attempt.answers[body.itemId];
  if (previous && body.clientSeq <= previous.clientSeq) {
    throw fail(409, 'STALE_CLIENT_SEQ', 'A newer answer has already been saved.', [
      { currentSeq: previous.clientSeq },
    ]);
  }

  const savedAt = nowIso();
  const saved = await repos.attemptRepo.saveAnswerIfNewer(
    attempt.id,
    body.itemId,
    {
      selectedOptionIds: body.selectedOptionIds ?? previous?.selectedOptionIds ?? [],
      numericValue: body.numericValue !== undefined ? body.numericValue : previous?.numericValue ?? null,
      markedForReview: body.markedForReview ?? previous?.markedForReview ?? false,
    },
    body.clientSeq,
    savedAt,
  );
  if (!saved) {
    throw fail(409, 'STALE_CLIENT_SEQ', 'A newer answer has already been saved.', [
      { currentSeq: previous?.clientSeq ?? body.clientSeq },
    ]);
  }
  return { ...saved, serverTime: savedAt };
};

export const recordViolation = async (repos, user, attemptId, body) => {
  let attempt = await repos.attemptRepo.findByIdAndStudent(attemptId, user.id);
  if (!attempt) {
    const any = await repos.attemptRepo.findById(attemptId);
    if (!any) throw notFound('Attempt not found.');
    throw forbidden('This attempt belongs to another student.');
  }
  const exam = await loadExam(repos.examRepo, attempt.examId);
  attempt = await finalizeExpired(repos.attemptRepo, attempt, exam);
  if (attempt.status !== 'in_progress') {
    throw attempt.finalizedBy === 'expiry'
      ? fail(409, 'ATTEMPT_EXPIRED', 'This attempt is no longer accepting violations.')
      : fail(409, 'INVALID_STATE', 'This attempt is no longer accepting violations.');
  }

  const now = nowIso();
  const updated = await repos.attemptRepo.recordViolation(attempt.id, {
    type: body.type,
    meta: body.meta || {},
    occurredAt: now,
  });
  if (!updated) throw fail(409, 'INVALID_STATE', 'This attempt is no longer accepting violations.');

  const settings = exam.settings || {};
  const limit = settings.violationLimit ?? 0;
  const reached = limit > 0 && settings.autoSubmitOnViolation === true && updated.violations.length >= limit;
  let finalAttempt = updated;
  if (reached) {
    const graded = gradeAttempt(updated.questionSet, updated.answers, gradeOptions(exam));
    finalAttempt =
      (await repos.attemptRepo.finalizeIfInProgress(updated.id, graded, {
        submittedAt: now,
        finalizedBy: 'violation',
      })) || (await repos.attemptRepo.findById(updated.id));
  }

  return {
    type: body.type,
    occurredAt: now,
    violationCount: finalAttempt.violations.length,
    maxViolations: limit,
    autoSubmitted: reached && finalAttempt.status === 'submitted',
    attemptStatus: finalAttempt.status,
    ...(reached && finalAttempt.status === 'submitted' ? { submittedAt: finalAttempt.submittedAt } : {}),
    serverTime: now,
  };
};

const gradeNow = async (repos, attempt, exam) => {
  const graded = gradeAttempt(attempt.questionSet, attempt.answers, gradeOptions(exam));
  const updated = await repos.attemptRepo.finalizeIfInProgress(attempt.id, graded, {
    submittedAt: nowIso(),
    finalizedBy: 'submit',
  });
  return updated || (await repos.attemptRepo.findById(attempt.id));
};

export const submitAttempt = async (repos, user, attemptId) => {
  const owned = await repos.attemptRepo.findByIdAndStudent(attemptId, user.id);
  if (!owned) {
    const any = await repos.attemptRepo.findById(attemptId);
    if (!any) throw notFound('Attempt not found.');
    throw forbidden('This attempt belongs to another student.');
  }
  const exam = await loadExam(repos.examRepo, owned.examId);

  let attempt = await finalizeExpired(repos.attemptRepo, owned, exam);
  if (attempt.status === 'in_progress') attempt = await gradeNow(repos, attempt, exam);
  return submittedSummary(attempt, exam);
};

export const getAttempt = async (repos, user, attemptId) => {
  const attempt = await repos.attemptRepo.findById(attemptId);
  if (!attempt) throw notFound('Attempt not found.');
  const exam = await loadExam(repos.examRepo, attempt.examId);

  if (user.role === 'student') {
    if (attempt.studentId !== user.id) throw forbidden('This attempt belongs to another student.');
    const current = await finalizeExpired(repos.attemptRepo, attempt, exam);
    return current.status === 'submitted' ? submittedSummary(current, exam) : attemptState(current, exam);
  }

  assertExamOwner(user, exam);
  const current = await finalizeExpired(repos.attemptRepo, attempt, exam);
  const student = await repos.userRepo.findById(current.studentId);
  return {
    attemptId: current.id,
    examId: current.examId,
    student: student ? { id: student.id, name: student.name, email: student.email } : null,
    status: current.status,
    startedAt: current.startedAt,
    expiresAt: current.expiresAt,
    submittedAt: current.submittedAt,
    answerCount: Object.keys(current.answers).length,
    violationCount: current.violations.length,
    serverTime: nowIso(),
  };
};

export const getResult = async (repos, user, attemptId) => {
  const attempt = await repos.attemptRepo.findById(attemptId);
  if (!attempt) throw notFound('Attempt not found.');
  const exam = await loadExam(repos.examRepo, attempt.examId);

  const isStudent = user.role === 'student';
  if (isStudent) {
    if (attempt.studentId !== user.id) throw forbidden('This result belongs to another student.');
  } else {
    assertExamOwner(user, exam);
  }

  const current = await finalizeExpired(repos.attemptRepo, attempt, exam);
  if (current.status !== 'submitted' || !current.gradedPayload) {
    throw fail(409, 'INVALID_STATE', 'Submit the attempt before viewing results.');
  }

  if (isStudent) {
    const release = resultAvailability(exam, current);
    if (!release.available) {
      throw fail(403, 'RESULT_NOT_AVAILABLE', 'Results have not been released yet.', [
        { availableAt: release.at },
      ]);
    }
    const payload = resultPayload(current, exam, { forStudent: true });
    const history = await repos.attemptRepo.listByStudent(user.id);
    const released = [];
    for (const entry of history) {
      if (entry.status !== 'submitted' || !entry.gradedPayload) continue;
      const entryExam = await repos.examRepo.findById(entry.examId);
      if (!entryExam || !resultAvailability(entryExam, entry).available) continue;
      released.push({
        examId: entryExam.id,
        examTitle: entryExam.title,
        percentage: entry.gradedPayload.percentage,
        submittedAt: entry.submittedAt,
      });
    }
    payload.scoreHistory = released
      .sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime())
      .slice(-10);
    return payload;
  }

  const payload = resultPayload(current, exam);
  const student = await repos.userRepo.findById(current.studentId);
  payload.student = student ? { id: student.id, name: student.name, email: student.email } : null;
  return payload;
};

// ---------------------------------------------------------------------------
// Teacher reporting
// ---------------------------------------------------------------------------

export const monitorExam = async (repos, user, examId, query) => {
  const exam = await loadExam(repos.examRepo, examId);
  assertExamOwner(user, exam);
  await finalizeExpiredForExam(repos, exam);

  const students = [
    ...(await repos.userRepo.findStudentsInBatches(exam.assignment.batchIds)),
    ...(await repos.userRepo.findUsersWhoJoined(exam.id)),
  ].filter((student) => student.role === 'student' && student.isActive);
  const eligible = [...new Map(students.map((student) => [student.id, student])).values()];
  const attempts = await repos.attemptRepo.listByExam(exam.id);
  const byStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));

  const rows = eligible.map((student) => monitorRow(student, byStudent.get(student.id)));
  const counts = {
    notStarted: rows.filter((row) => row.status === 'not_started').length,
    inProgress: rows.filter((row) => row.status === 'in_progress').length,
    submitted: rows.filter((row) => row.status === 'submitted').length,
  };

  const needle = query.q?.toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!query.status || row.status === query.status) &&
      (!needle || `${row.student.name} ${row.student.email}`.toLowerCase().includes(needle)),
  );
  const paged = paginate(filtered, query.page, query.limit);
  return {
    data: paged.data,
    meta: { ...paged.meta, serverTime: nowIso(), counts },
  };
};

export const examResults = async (repos, user, examId, query) => {
  const exam = await loadExam(repos.examRepo, examId);
  assertExamOwner(user, exam);
  await finalizeExpiredForExam(repos, exam);

  const submitted = await repos.attemptRepo.listSubmittedByExam(exam.id);
  const students = new Map(
    (await repos.userRepo.findByIds(submitted.map((attempt) => attempt.studentId))).map((student) => [
      student.id,
      student,
    ]),
  );
  const needle = query.q?.toLowerCase();
  const rows = submitted
    .map((attempt) => resultRow(students.get(attempt.studentId) || { id: attempt.studentId, name: '', email: '' }, attempt))
    .filter((row) => !needle || `${row.student.name} ${row.student.email}`.toLowerCase().includes(needle))
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());

  return paginate(rows, query.page, query.limit);
};

export const examAnalytics = async (repos, user, examId) => {
  const exam = await loadExam(repos.examRepo, examId);
  assertExamOwner(user, exam);
  await finalizeExpiredForExam(repos, exam);
  const summary = await repos.analyticsRepo.examSummary(exam.id);
  if (!summary) throw notFound('Exam not found.');
  return summary;
};

export const releaseResults = async (repos, user, examId) => {
  const exam = await loadExam(repos.examRepo, examId);
  assertExamOwner(user, exam);
  if (exam.status !== 'published') {
    throw fail(409, 'INVALID_STATE', 'Publish the exam before releasing results.');
  }
  const released = await repos.examRepo.releaseResults(exam.id);
  if (!released) throw fail(409, 'INVALID_STATE', 'Publish the exam before releasing results.');
  return { id: released.id, resultsReleasedAt: released.resultsReleasedAt };
};

export const exportResults = async (repos, user, examId) => {
  const exam = await loadExam(repos.examRepo, examId);
  assertExamOwner(user, exam);
  await finalizeExpiredForExam(repos, exam);

  const submitted = await repos.attemptRepo.listSubmittedByExam(exam.id);
  const students = new Map(
    (await repos.userRepo.findByIds(submitted.map((attempt) => attempt.studentId))).map((student) => [
      student.id,
      student,
    ]),
  );
  const rows = submitted
    .map((attempt) => {
      const student = students.get(attempt.studentId);
      return [
        student?.name || '',
        student?.email || '',
        attempt.status,
        attempt.gradedPayload.score,
        attempt.gradedPayload.maxScore,
        attempt.gradedPayload.percentage,
        attempt.gradedPayload.passed,
        attempt.submittedAt,
        attempt.violations.length,
      ];
    })
    .sort((left, right) => right[3] - left[3] || String(left[0]).localeCompare(String(right[0])));

  const csv = [
    'studentName,email,status,score,maxScore,percentage,passed,submittedAt,violationCount',
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\n');
  return { filename: `${slugify(exam.title)}-results.csv`, csv };
};
