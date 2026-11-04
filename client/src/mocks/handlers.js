import { delay, http, HttpResponse } from 'msw';

import { gradeAttempt } from './grading';
import { ImportFileError, parseImportFile } from './importParser';
import * as S from './state';
import { isAnswered } from './grading';
import {
  isEmail,
  paginate,
  validateAnswer,
  validateExam,
  validateJoinCode,
  validatePagination,
  validateQuestion,
  validateRegister,
  validateUserPatch,
  validateViolation,
} from './validation';

const API = '/api/v1';

const ok = (data, meta, status = 200) =>
  HttpResponse.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });

const fail = (status, code, message, details) =>
  HttpResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );

const validationError = (details, message = 'One or more fields are invalid.') =>
  fail(400, 'VALIDATION_ERROR', message, details);

const simulate = async (resolver, { skipFailure = false } = {}) => {
  if (S.state.offline) {
    return fail(503, 'SERVICE_UNAVAILABLE', 'The mock network is offline. Bring it back online in Mock tools.');
  }
  await delay(100 + Math.floor(Math.random() * 300));
  if (!skipFailure && Math.random() < S.state.randomFailureRate) {
    return fail(503, 'SERVICE_UNAVAILABLE', 'A simulated transient network failure occurred. Retry the request.');
  }
  return resolver();
};

const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const currentUser = (request) => {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const match = token.match(/^mock-access\.([a-fA-F0-9]{24})(?:\.|$)/);
  if (!match) return null;
  const user = S.findUser(match[1]);
  return user?.isActive ? user : null;
};

const authorize = (request, roles) => {
  const user = currentUser(request);
  if (!user) return { error: fail(401, 'UNAUTHORIZED', 'Sign in to continue.') };
  if (!user.isActive) return { error: fail(403, 'FORBIDDEN', 'This account is inactive.') };
  if (roles && !roles.includes(user.role)) {
    return { error: fail(403, 'FORBIDDEN', 'You do not have permission to do that.') };
  }
  return { user };
};

const manageExam = (user, exam) => user.role === 'admin' || exam.createdBy === user.id;
const manageQuestion = (user, question) => user.role === 'admin' || question.createdBy === user.id;

const findExamOrFail = (id) => {
  const exam = S.findExam(id);
  return exam ? { exam } : { error: fail(404, 'NOT_FOUND', 'Exam not found.') };
};

const findAttemptOrFail = (id) => {
  const attempt = S.findAttempt(id);
  return attempt ? { attempt } : { error: fail(404, 'NOT_FOUND', 'Attempt not found.') };
};

const questionPayload = (body, user, existing = {}) => {
  const now = new Date().toISOString();
  return {
    ...existing,
    ...body,
    id: existing.id || S.newId(),
    options: body.options ?? existing.options ?? [],
    correctOptionIds: body.correctOptionIds ?? existing.correctOptionIds ?? [],
    numericAnswer:
      body.numericAnswer !== undefined ? body.numericAnswer : (existing.numericAnswer ?? null),
    explanation: body.explanation ?? existing.explanation ?? '',
    defaultMarks: body.defaultMarks ?? existing.defaultMarks ?? 0,
    negativeMarks: body.negativeMarks ?? existing.negativeMarks ?? 0,
    createdBy: existing.createdBy || user.id,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
};

const withPhase = (exam) => ({ ...exam, phase: S.examPhase(exam) });

const buildExamItems = (inputItems, user) => {
  const items = [];
  for (let index = 0; index < inputItems.length; index += 1) {
    const input = inputItems[index];
    const question = S.findQuestion(input.questionId);
    if (!question) {
      return { error: fail(404, 'NOT_FOUND', 'One of the selected questions no longer exists.') };
    }
    if (!manageQuestion(user, question)) {
      return { error: fail(403, 'FORBIDDEN', 'You can only use your own questions.') };
    }
    items.push({
      id: S.newId(),
      questionId: question.id,
      order: index + 1,
      marks: input.marks ?? question.defaultMarks,
      negativeMarks: input.negativeMarks ?? question.negativeMarks,
      questionSnapshot: null,
    });
  }
  return { items };
};

const generatedJoinCode = (title) => {
  const prefix = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'EXAM';
  let code = '';
  do {
    code = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 32);
  } while (S.state.exams.some((exam) => exam.joinCode === code));
  return code;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const authHandlers = [
  http.post(`${API}/auth/register`, ({ request }) =>
    simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const errors = validateRegister(body);
      if (errors.length) return validationError(errors);
      const email = body.email.trim().toLowerCase();
      if (S.state.users.some((user) => user.email === email)) {
        return fail(409, 'DUPLICATE_EMAIL', 'An account with this email already exists.');
      }
      const now = new Date().toISOString();
      const role = body.role || 'student';
      let isActive = true;
      let approvalStatus = 'approved';
      if (role === 'teacher') {
        const inviteCode = String(body.inviteCode || '').trim();
        if (inviteCode) {
          if (inviteCode !== 'TEACH-2026') {
            return fail(
              403,
              'INVALID_INVITE_CODE',
              'Invalid teacher invite code. Leave blank to request administrator approval.',
            );
          }
        } else {
          isActive = false;
          approvalStatus = 'pending';
        }
      }
      const user = {
        id: S.newId(),
        name: body.name.trim(),
        email,
        role,
        batchIds: [],
        isActive,
        approvalStatus,
        password: body.password,
        createdAt: now,
        updatedAt: now,
      };
      S.state.users.push(user);
      if (!isActive) {
        S.persist();
        return ok({ user: S.publicUser(user), accessToken: null, pendingApproval: true }, undefined, 201);
      }
      S.state.currentUserId = user.id;
      S.persist();
      return ok({ user: S.publicUser(user), accessToken: `mock-access.${user.id}.${Date.now()}` }, undefined, 201);
    }, { skipFailure: true }),
  ),
  http.post(`${API}/auth/login`, ({ request }) =>
    simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const errors = [];
      if (!isEmail(body.email)) errors.push({ path: 'email', message: 'Enter a valid email address.' });
      if (typeof body.password !== 'string' || !body.password) errors.push({ path: 'password', message: 'Enter your password.' });
      if (errors.length) return validationError(errors);

      const user = S.state.users.find((entry) => entry.email === body.email.trim().toLowerCase());
      if (!user || user.password !== body.password || !user.isActive) {
        return fail(401, 'UNAUTHORIZED', 'Email or password is incorrect, or the account is inactive.');
      }
      S.state.currentUserId = user.id;
      S.persist();
      return ok({ user: S.publicUser(user), accessToken: `mock-access.${user.id}.${Date.now()}` });
    }, { skipFailure: true }),
  ),
  http.post(`${API}/auth/refresh`, () =>
    simulate(
      () => {
        const user = S.getCurrentUser();
        if (!user?.isActive) return fail(401, 'UNAUTHORIZED', 'Your session has expired. Sign in again.');
        return ok({ accessToken: `mock-access.${user.id}.${Date.now()}` });
      },
      { skipFailure: true },
    ),
  ),
  http.post(`${API}/auth/logout`, ({ request }) => {
    const auth = authorize(request);
    if (auth.error) return auth.error;
    S.state.currentUserId = null;
    S.persist();
    return simulate(() => ok({ message: 'Logged out.' }), { skipFailure: true });
  }),
  http.get(`${API}/auth/me`, ({ request }) => {
    const auth = authorize(request);
    if (auth.error) return auth.error;
    return simulate(() => ok(S.publicUser(auth.user)), { skipFailure: true });
  }),
];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const userHandlers = [
  http.get(`${API}/users`, ({ request }) => {
    const auth = authorize(request, ['admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const role = url.searchParams.get('role');
      const batch = url.searchParams.get('batch');
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const isActive = url.searchParams.get('isActive');

      const filtered = S.state.users.filter(
        (user) =>
          (!role || user.role === role) &&
          (!batch || user.batchIds.includes(batch)) &&
          (isActive === null || String(user.isActive) === isActive) &&
          (!q || `${user.name} ${user.email}`.toLowerCase().includes(q)),
      );
      const { rows, meta } = paginate(filtered, page, limit);
      return ok(rows.map(S.publicUser), {
        ...meta,
        summary: S.userSummary(S.state.users),
        batches: S.batchOptions(),
      });
    });
  }),
  http.patch(`${API}/users/:id`, ({ request, params }) => {
    const auth = authorize(request, ['admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const user = S.findUser(params.id);
      if (!user) return fail(404, 'NOT_FOUND', 'User not found.');
      const errors = validateUserPatch(body);
      if (errors.length) return validationError(errors);
      if (user.id === auth.user.id && (body.role && body.role !== 'admin')) {
        return fail(409, 'INVALID_STATE', 'You cannot remove your own admin role.');
      }
      if (user.id === auth.user.id && body.isActive === false) {
        return fail(409, 'INVALID_STATE', 'You cannot deactivate your own account.');
      }
      Object.assign(user, body, { updatedAt: new Date().toISOString() });
      S.persist();
      return ok(S.publicUser(user));
    });

    http.delete(`${API}/users/:id`, ({ request, params }) => {
      const auth = authorize(request, ['admin']);
      if (auth.error) return auth.error;
      if (params.id === auth.user.id) return fail(409, 'INVALID_STATE', 'You cannot delete your own admin account.');
      const index = S.state.users.findIndex((user) => user.id === params.id);
      if (index < 0) return fail(404, 'NOT_FOUND', 'User not found.');
      if (S.state.users[index].role === 'admin' && S.state.users.filter((user) => user.role === 'admin').length <= 1) {
        return fail(409, 'INVALID_STATE', 'The last administrator cannot be deleted.');
      }
      const [deleted] = S.state.users.splice(index, 1);
      return ok({ id: deleted.id, deleted: true });
    });
  }),
];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questionHandlers = [
  http.get(`${API}/questions`, ({ request }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const visible = auth.user.role === 'admin'
        ? S.state.questions
        : S.state.questions.filter((question) => question.createdBy === auth.user.id);
      const subject = url.searchParams.get('subject');
      const topic = url.searchParams.get('topic');
      const difficulty = url.searchParams.get('difficulty');
      const type = url.searchParams.get('type');
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const filtered = visible.filter(
        (question) =>
          (!subject || question.subject === subject) &&
          (!topic || question.topic === topic) &&
          (!difficulty || question.difficulty === difficulty) &&
          (!type || question.type === type) &&
          (!q || question.prompt.toLowerCase().includes(q)),
      );
      const { rows, meta } = paginate(filtered, page, limit);
      return ok(rows, { ...meta, facets: S.questionFacets(visible) });
    });
  }),
  http.post(`${API}/questions`, ({ request }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const errors = validateQuestion(body);
      if (errors.length) return validationError(errors);
      const question = questionPayload(body, auth.user);
      S.state.questions.push(question);
      S.persist();
      return ok(question, undefined, 201);
    });
  }),
  http.get(`${API}/questions/:id`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const question = S.findQuestion(params.id);
      if (!question) return fail(404, 'NOT_FOUND', 'Question not found.');
      if (!manageQuestion(auth.user, question)) return fail(403, 'FORBIDDEN', 'This question belongs to another teacher.');
      return ok(question);
    });
  }),
  http.patch(`${API}/questions/:id`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const question = S.findQuestion(params.id);
      if (!question) return fail(404, 'NOT_FOUND', 'Question not found.');
      if (!manageQuestion(auth.user, question)) return fail(403, 'FORBIDDEN', 'This question belongs to another teacher.');
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const merged = questionPayload(body, auth.user, question);
      const errors = validateQuestion(merged);
      if (errors.length) return validationError(errors);
      Object.assign(question, merged);
      S.persist();
      return ok(question);
    });
  }),
  http.delete(`${API}/questions/:id`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const index = S.state.questions.findIndex((question) => question.id === params.id);
      if (index < 0) return fail(404, 'NOT_FOUND', 'Question not found.');
      if (!manageQuestion(auth.user, S.state.questions[index])) {
        return fail(403, 'FORBIDDEN', 'This question belongs to another teacher.');
      }
      S.state.questions.splice(index, 1);
      S.persist();
      return ok({ id: params.id, deleted: true });
    });
  }),
  http.post(`${API}/questions/import`, ({ request }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return validationError([{ path: 'file', message: 'Choose a CSV file.' }]);
      }
      if (file.size > 5 * 1024 * 1024) return fail(413, 'FILE_TOO_LARGE', 'The import file must be 5 MB or smaller.');
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'csv') {
        return fail(415, 'UNSUPPORTED_FILE_TYPE', 'Only CSV files are supported.');
      }

      let rows;
      try {
        rows = await parseImportFile(file);
      } catch (error) {
        if (error instanceof ImportFileError) {
          return fail(422, error.code, error.message, error.details);
        }
        return fail(422, 'IMPORT_VALIDATION_FAILED', 'The import file could not be read.');
      }

      const now = new Date().toISOString();
      const createdIds = [];
      const errors = [];
      rows.forEach(({ row, input }) => {
        const rowErrors = validateQuestion(input);
        if (rowErrors.length) {
          errors.push({
            row,
            code: 'VALIDATION_ERROR',
            message: 'This row could not be imported.',
            details: rowErrors,
          });
          return;
        }
        const question = {
          ...input,
          id: S.newId(),
          explanation: input.explanation || '',
          createdBy: auth.user.id,
          createdAt: now,
          updatedAt: now,
        };
        S.state.questions.push(question);
        createdIds.push(question.id);
      });
      S.persist();
      return ok({
        createdCount: createdIds.length,
        failedCount: errors.length,
        createdIds,
        errors,
      });
    });
  }),
];

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

const examHandlers = [
  http.post(`${API}/exams`, ({ request }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const errors = validateExam(body);
      if (errors.length) return validationError(errors);
      const inputItems = Array.isArray(body.items) ? body.items : [];
      const built = buildExamItems(inputItems, auth.user);
      if (built.error) return built.error;
      const now = new Date().toISOString();
      const exam = {
        id: S.newId(),
        title: body.title.trim(),
        description: body.description?.trim() || '',
        durationMinutes: body.durationMinutes,
        startAt: body.startAt,
        endAt: body.endAt,
        status: 'draft',
        resultMode: body.resultMode || 'after_end',
        settings: {
          shuffleQuestions: true,
          shuffleOptions: true,
          passPercentage: 40,
          violationLimit: 3,
          autoSubmitOnViolation: true,
          ...(body.settings || {}),
        },
        assignment: {
          batchIds: body.assignment?.batchIds || [],
          joinCodeEnabled: body.assignment?.joinCodeEnabled ?? true,
        },
        joinCode: null,
        items: built.items,
        createdBy: auth.user.id,
        publishedAt: null,
        resultsReleasedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      S.state.exams.push(exam);
      S.persist();
      return ok(withPhase(exam), undefined, 201);
    });
  }),
  http.get(`${API}/exams`, ({ request }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const visible = auth.user.role === 'admin'
        ? S.state.exams
        : S.state.exams.filter((exam) => exam.createdBy === auth.user.id);
      const status = url.searchParams.get('status');
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const filtered = visible
        .filter((exam) => (!status || exam.status === status) && (!q || exam.title.toLowerCase().includes(q)))
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
      const { rows, meta } = paginate(filtered, page, limit);
      return ok(rows.map((exam) => S.examSummary(exam)), {
        ...meta,
        summary: S.examSummaryCounts(visible),
        batches: S.batchOptions(),
      });
    });
  }),
  http.get(`${API}/exams/available`, ({ request }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const scope = url.searchParams.get('scope') || 'all';
      if (!['upcoming', 'live', 'past', 'all'].includes(scope)) {
        return validationError([{ path: 'scope', message: 'Choose upcoming, live, past, or all.' }]);
      }

      const now = S.getServerNow();
      const entries = S.state.exams
        .filter((exam) => exam.status === 'published' && S.isStudentEligible(exam, auth.user.id))
        .map((exam) => {
          let attempt = S.state.attempts.find(
            (entry) => entry.examId === exam.id && entry.studentId === auth.user.id,
          );
          attempt = S.ensureNotExpired(attempt, exam, now);
          return S.toStudentExamMeta(exam, attempt, now);
        })
        .filter((exam) => {
          if (scope === 'all') return true;
          if (scope === 'past') return exam.availability === 'ended' || exam.attemptStatus === 'submitted';
          return exam.availability === scope;
        })
        .sort((left, right) => new Date(left.startAt) - new Date(right.startAt));

      const { rows, meta } = paginate(entries, page, limit);
      return ok(rows, { ...meta, serverTime: S.serverNowIso() });
    });
  }),
  http.get(`${API}/exams/:id`, ({ request, params }) => {
    const auth = authorize(request);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (auth.user.role === 'student') {
        if (exam.status !== 'published' || !S.isStudentEligible(exam, auth.user.id)) {
          return fail(403, 'FORBIDDEN', 'This exam is not assigned to you.');
        }
        let attempt = S.state.attempts.find(
          (entry) => entry.examId === exam.id && entry.studentId === auth.user.id,
        );
        attempt = S.ensureNotExpired(attempt, exam);
        return ok(S.toStudentExamMeta(exam, attempt));
      }
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');
      return ok(withPhase(exam));
    });
  }),
  http.patch(`${API}/exams/:id`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      if (exam.status === 'published') {
        if (Object.keys(body).some((key) => !['startAt', 'endAt'].includes(key))) {
          return fail(409, 'INVALID_STATE', 'Published exams only allow schedule changes.');
        }
        const mergedSchedule = { startAt: body.startAt || exam.startAt, endAt: body.endAt || exam.endAt };
        const errors = validateExam({ ...exam, ...mergedSchedule });
        if (errors.length) return validationError(errors);
        Object.assign(exam, mergedSchedule, { updatedAt: new Date().toISOString() });
        S.persist();
        return ok(withPhase(exam));
      }

      let nextItems = exam.items;
      if (body.items !== undefined) {
        const built = buildExamItems(body.items, auth.user);
        if (built.error) return built.error;
        nextItems = built.items;
      }
      const merged = {
        ...exam,
        ...body,
        items: nextItems,
        settings: { ...exam.settings, ...(body.settings || {}) },
        assignment: { ...exam.assignment, ...(body.assignment || {}) },
      };
      const errors = validateExam(merged);
      if (errors.length) return validationError(errors);
      Object.assign(exam, {
        title: merged.title,
        description: merged.description,
        durationMinutes: merged.durationMinutes,
        startAt: merged.startAt,
        endAt: merged.endAt,
        resultMode: merged.resultMode,
        settings: merged.settings,
        assignment: merged.assignment,
        items: merged.items,
        updatedAt: new Date().toISOString(),
      });
      S.persist();
      return ok(withPhase(exam));
    });
  }),
  http.delete(`${API}/exams/:id`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');
      S.state.exams = S.state.exams.filter((entry) => entry.id !== exam.id);
      S.state.attempts = S.state.attempts.filter((entry) => entry.examId !== exam.id);
      S.persist();
      return ok({ id: exam.id, deleted: true });
    });
  }),
  http.post(`${API}/exams/:id/publish`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');
      if (exam.status === 'published') return fail(409, 'INVALID_STATE', 'This exam is already published.');
      if (exam.items.length === 0) return fail(409, 'INVALID_STATE', 'Add at least one question before publishing.');

      for (const item of exam.items) {
        const question = S.findQuestion(item.questionId);
        if (!question) {
          return fail(409, 'INVALID_STATE', 'A question used by this exam was deleted. Remove it before publishing.');
        }
        if (!manageQuestion(auth.user, question)) {
          return fail(403, 'FORBIDDEN', 'You can only publish exams built from your own questions.');
        }
        item.questionSnapshot = {
          subject: question.subject,
          topic: question.topic,
          difficulty: question.difficulty,
          type: question.type,
          prompt: question.prompt,
          options: question.options.map((option) => ({ ...option })),
          correctOptionIds: [...question.correctOptionIds],
          numericAnswer: question.numericAnswer,
          explanation: question.explanation,
        };
      }

      exam.status = 'published';
      exam.publishedAt = new Date().toISOString();
      if (exam.assignment.joinCodeEnabled && !exam.joinCode) {
        exam.joinCode = generatedJoinCode(exam.title);
      }
      exam.updatedAt = exam.publishedAt;
      S.persist();
      return ok({ id: exam.id, status: exam.status, joinCode: exam.joinCode, publishedAt: exam.publishedAt });
    });
  }),
  http.post(`${API}/exams/join`, ({ request }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      if (!validateJoinCode(body.joinCode)) {
        return validationError([{ path: 'joinCode', message: 'Enter a valid join code.' }]);
      }
      const code = body.joinCode.trim().toUpperCase();
      const exam = S.state.exams.find((entry) => entry.joinCode === code);
      if (!exam) return fail(404, 'NOT_FOUND', 'No exam matches that join code.');
      if (exam.status !== 'published' || !exam.assignment.joinCodeEnabled) {
        return fail(403, 'EXAM_NOT_LIVE', 'This exam is not accepting join codes.');
      }
      if (S.examPhase(exam) === 'ended') return fail(403, 'EXAM_NOT_LIVE', 'This exam has already ended.');
      const joined = S.state.joinedExamIdsByStudent[auth.user.id] || [];
      if (!joined.includes(exam.id)) {
        S.state.joinedExamIdsByStudent[auth.user.id] = [...joined, exam.id];
        S.persist();
      }
      const attempt = S.state.attempts.find(
        (entry) => entry.examId === exam.id && entry.studentId === auth.user.id,
      );
      return ok(S.toStudentExamMeta(exam, attempt));
    });
  }),
];

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

const attemptHandlers = [
  http.post(`${API}/exams/:id/start`, ({ request, params }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (exam.status !== 'published' || S.examPhase(exam) !== 'live') {
        return fail(403, 'EXAM_NOT_LIVE', 'This exam is not live right now.');
      }
      if (!S.isStudentEligible(exam, auth.user.id)) {
        return fail(403, 'FORBIDDEN', 'This exam is not assigned to you.');
      }

      const now = S.getServerNow();
      let attempt = S.state.attempts.find(
        (entry) => entry.examId === exam.id && entry.studentId === auth.user.id,
      );
      if (attempt) {
        attempt = S.ensureNotExpired(attempt, exam, now);
        if (attempt.status === 'submitted') {
          return fail(409, 'ALREADY_ATTEMPTED', 'You have already submitted this exam.');
        }
        return ok(S.attemptState(attempt, exam));
      }

      const startedAt = now.toISOString();
      const expiresAt = new Date(
        Math.min(now.getTime() + exam.durationMinutes * 60_000, new Date(exam.endAt).getTime()),
      ).toISOString();
      attempt = {
        id: S.newId(),
        examId: exam.id,
        studentId: auth.user.id,
        status: 'in_progress',
        startedAt,
        submittedAt: null,
        expiresAt,
        answers: {},
        lastClientSeq: 0,
        violationEvents: [],
        questionSet: S.buildQuestionSet(exam),
        finalizedBy: null,
        score: null,
        maxScore: null,
        percentage: null,
        passed: null,
        timeTakenSeconds: null,
      };
      S.state.attempts.push(attempt);
      S.persist();
      return ok(S.attemptState(attempt, exam), undefined, 201);
    });
  }),
  http.get(`${API}/attempts/:id`, ({ request, params }) => {
    const auth = authorize(request);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');

      if (auth.user.role === 'student') {
        if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This attempt belongs to another student.');
        S.ensureNotExpired(attempt, exam);
        if (attempt.status === 'submitted') return ok(S.submittedSummary(attempt, exam));
        return ok(S.attemptState(attempt, exam));
      }

      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This attempt belongs to another teacher.');
      S.ensureNotExpired(attempt, exam);
      return ok({
        attemptId: attempt.id,
        examId: attempt.examId,
        student: S.publicUser(S.findUser(attempt.studentId)),
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        submittedAt: attempt.submittedAt,
        answerCount: S.answerCount(attempt),
        violationCount: attempt.violationEvents.length,
        serverTime: S.serverNowIso(),
      });
    });
  }),
  http.patch(`${API}/attempts/:id/answer`, ({ request, params }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This attempt belongs to another student.');
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');

      S.ensureNotExpired(attempt, exam);
      if (attempt.status !== 'in_progress') {
        return fail(
          409,
          attempt.finalizedBy === 'expiry' ? 'ATTEMPT_EXPIRED' : 'INVALID_STATE',
          'This attempt is no longer accepting answers.',
        );
      }

      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const item = attempt.questionSet.find((entry) => entry.id === body.itemId);
      if (!item) return fail(404, 'NOT_FOUND', 'That question does not belong to this attempt.');
      const errors = validateAnswer(body, item);
      if (errors.length) return validationError(errors);

      if (body.clientSeq <= attempt.lastClientSeq) {
        return fail(409, 'STALE_CLIENT_SEQ', 'A newer answer has already been saved.', [
          { currentSeq: attempt.lastClientSeq },
        ]);
      }

      if (S.state.failNextSave) {
        S.state.failNextSave = false;
        return fail(503, 'SERVICE_UNAVAILABLE', 'The next save was configured to fail. Retry to verify autosave.');
      }

      const previous = attempt.answers[body.itemId] || {
        selectedOptionIds: [],
        numericValue: null,
        markedForReview: false,
      };
      const next = {
        itemId: body.itemId,
        selectedOptionIds:
          body.selectedOptionIds !== undefined ? body.selectedOptionIds : previous.selectedOptionIds,
        numericValue: body.numericValue !== undefined ? body.numericValue : previous.numericValue,
        markedForReview:
          body.markedForReview !== undefined ? body.markedForReview : previous.markedForReview,
        clientSeq: body.clientSeq,
        updatedAt: new Date().toISOString(),
      };
      attempt.answers[body.itemId] = next;
      attempt.lastClientSeq = body.clientSeq;
      S.persist();
      return ok({ ...next, serverTime: S.serverNowIso() });
    });
  }),
  http.post(`${API}/attempts/:id/violation`, ({ request, params }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(async () => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This attempt belongs to another student.');
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');

      S.ensureNotExpired(attempt, exam);
      if (attempt.status !== 'in_progress') {
        return fail(
          409,
          attempt.finalizedBy === 'expiry' ? 'ATTEMPT_EXPIRED' : 'INVALID_STATE',
          'This attempt is no longer accepting violations.',
        );
      }

      const body = await readJson(request);
      if (!body) return validationError([{ path: 'body', message: 'Invalid JSON body.' }]);
      const errors = validateViolation(body);
      if (errors.length) return validationError(errors);

      const event = {
        type: body.type,
        meta: body.meta || {},
        occurredAt: S.serverNowIso(),
      };
      attempt.violationEvents.push(event);
      const limit = exam.settings.violationLimit;
      const autoSubmitted =
        limit > 0 && exam.settings.autoSubmitOnViolation && attempt.violationEvents.length >= limit;
      if (autoSubmitted) S.finalizeAttempt(attempt, 'violation');
      S.persist();

      return ok(
        {
          type: event.type,
          occurredAt: event.occurredAt,
          violationCount: attempt.violationEvents.length,
          maxViolations: limit,
          autoSubmitted,
          attemptStatus: attempt.status,
          ...(autoSubmitted ? { submittedAt: attempt.submittedAt } : {}),
          serverTime: S.serverNowIso(),
        },
        undefined,
        201,
      );
    });
  }),
  http.post(`${API}/attempts/:id/heartbeat`, ({ request, params }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This attempt belongs to another student.');
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');
      S.ensureNotExpired(attempt, exam);
      return ok({
        attemptId: attempt.id,
        status: attempt.status,
        violationCount: attempt.violationEvents.length,
        maxViolations: exam.settings.violationLimit,
        autoSubmitted: false,
        serverTime: S.serverNowIso(),
      });
    }, { skipFailure: true });
  }),
  http.post(`${API}/attempts/:id/submit`, ({ request, params }) => {
    const auth = authorize(request, ['student']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This attempt belongs to another student.');
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');

      if (attempt.status === 'in_progress') {
        const expired = new Date(attempt.expiresAt) <= S.getServerNow();
        S.finalizeAttempt(attempt, expired ? 'expiry' : 'submit', S.serverNowIso());
      }
      S.persist();
      return ok(S.submittedSummary(attempt, exam));
    });
  }),
  http.get(`${API}/attempts/:id/result`, ({ request, params }) => {
    const auth = authorize(request);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { attempt, error } = findAttemptOrFail(params.id);
      if (error) return error;
      const exam = S.findExam(attempt.examId);
      if (!exam) return fail(404, 'NOT_FOUND', 'Exam not found.');
      S.ensureNotExpired(attempt, exam);
      if (attempt.status !== 'submitted') {
        return fail(409, 'INVALID_STATE', 'Submit the attempt before viewing results.');
      }

      if (auth.user.role === 'student') {
        if (attempt.studentId !== auth.user.id) return fail(403, 'FORBIDDEN', 'This result belongs to another student.');
        const availability = S.resultAvailability(exam, attempt);
        if (!availability.available) {
          return fail(403, 'RESULT_NOT_AVAILABLE', 'Results have not been released yet.', [
            { availableAt: availability.at },
          ]);
        }
        return ok(S.toResult(attempt, exam, { forStudent: true }));
      }

      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This result belongs to another teacher.');
      return ok(S.toResult(attempt, exam));
    });
  }),
];

// ---------------------------------------------------------------------------
// Teacher reporting
// ---------------------------------------------------------------------------

const reportHandlers = [
  http.get(`${API}/exams/:id/monitor`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');

      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const status = url.searchParams.get('status');
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();

      S.state.attempts
        .filter((attempt) => attempt.examId === exam.id)
        .forEach((attempt) => S.ensureNotExpired(attempt, exam));

      const students = S.eligibleStudents(exam);
      const rows = students.map((student) => {
        const attempt = S.state.attempts.find(
          (entry) => entry.examId === exam.id && entry.studentId === student.id,
        );
        return {
          attemptId: attempt?.id || null,
          student: S.publicUser(student),
          status: attempt?.status || 'not_started',
          startedAt: attempt?.startedAt || null,
          expiresAt: attempt?.expiresAt || null,
          submittedAt: attempt?.submittedAt || null,
          answerCount: attempt ? S.answerCount(attempt) : 0,
          violationCount: attempt?.violationEvents.length || 0,
          lastActivityAt: attempt ? S.lastActivityAt(attempt) : null,
        };
      });

      const counts = {
        notStarted: rows.filter((row) => row.status === 'not_started').length,
        inProgress: rows.filter((row) => row.status === 'in_progress').length,
        submitted: rows.filter((row) => row.status === 'submitted').length,
      };
      const filtered = rows.filter(
        (row) =>
          (!status || row.status === status) &&
          (!q || `${row.student.name} ${row.student.email}`.toLowerCase().includes(q)),
      );
      const paged = paginate(filtered, page, limit);
      return ok(paged.rows, {
        ...paged.meta,
        serverTime: S.serverNowIso(),
        counts,
      });
    });
  }),
  http.get(`${API}/exams/:id/results`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');

      const url = new URL(request.url);
      const { page, limit, errors } = validatePagination(url.searchParams);
      if (errors.length) return validationError(errors);
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();

      const rows = S.state.attempts
        .filter((attempt) => attempt.examId === exam.id && attempt.status === 'submitted')
        .map((attempt) => {
          const student = S.findUser(attempt.studentId);
          return {
            attemptId: attempt.id,
            student: S.publicUser(student),
            status: 'submitted',
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            passed: attempt.passed,
            submittedAt: attempt.submittedAt,
            timeTakenSeconds: attempt.timeTakenSeconds,
            violationCount: attempt.violationEvents.length,
          };
        })
        .filter((row) => !q || `${row.student?.name} ${row.student?.email}`.toLowerCase().includes(q))
        .sort((left, right) => new Date(right.submittedAt) - new Date(left.submittedAt));

      const paged = paginate(rows, page, limit);
      return ok(paged.rows, paged.meta);
    });
  }),
  http.get(`${API}/exams/:id/analytics`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');

      const allAttempts = S.state.attempts.filter((attempt) => attempt.examId === exam.id);
      allAttempts.forEach((attempt) => S.ensureNotExpired(attempt, exam));
      const submitted = allAttempts.filter((attempt) => attempt.status === 'submitted');
      const eligibleCount = S.eligibleStudents(exam).length;
      const maxScore = exam.items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
      const grades = submitted.map((attempt) => ({
        attempt,
        grade: gradeAttempt(attempt.questionSet, attempt.answers, exam.settings.passPercentage),
      }));
      const percentages = grades.map(({ grade }) => grade.percentage);
      const totalTime = submitted.reduce((sum, attempt) => sum + (attempt.timeTakenSeconds || 0), 0);

      const bands = Array.from({ length: 10 }, (_, index) => {
        const min = index * 10;
        const max = index === 9 ? 100 : min + 9;
        return {
          label: `${min}-${max}`,
          min,
          max,
          count: percentages.filter((value) => value >= min && value <= max).length,
        };
      });

      const itemStats = exam.items.map((item) => {
        let attemptedCount = 0;
        let correctCount = 0;
        let awardedTotal = 0;
        grades.forEach(({ attempt, grade }) => {
          const answer = attempt.answers[item.id];
          const gradedItem = grade.items.find((entry) => entry.itemId === item.id);
          if (answer && isAnswered({ ...item, question: item.questionSnapshot }, answer)) {
            attemptedCount += 1;
            awardedTotal += gradedItem?.awardedMarks || 0;
            if (gradedItem?.isCorrect) correctCount += 1;
          }
        });
        return {
          itemId: item.id,
          order: item.order,
          prompt: item.questionSnapshot?.prompt || '',
          attemptedCount,
          correctCount,
          correctPercentage: attemptedCount ? Math.round((correctCount / attemptedCount) * 1000) / 10 : 0,
          averageAwardedMarks: attemptedCount ? Math.round((awardedTotal / attemptedCount) * 100) / 100 : 0,
          averageTimeSeconds:
            attemptedCount && totalTime
              ? Math.round(totalTime / submitted.length / Math.max(1, exam.items.length))
              : 0,
        };
      });

      const leaderboard = submitted
        .map((attempt) => {
          const student = S.findUser(attempt.studentId);
          return {
            studentId: attempt.studentId,
            studentName: student?.name || 'Unknown student',
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            submittedAt: attempt.submittedAt,
          };
        })
        .sort((left, right) => right.score - left.score || left.studentName.localeCompare(right.studentName))
        .map((row, index) => ({ ...row, rank: index + 1 }));

      return ok({
        examId: exam.id,
        examTitle: exam.title,
        attemptCount: allAttempts.length,
        submittedCount: submitted.length,
        inProgressCount: allAttempts.filter((attempt) => attempt.status === 'in_progress').length,
        notStartedCount: Math.max(0, eligibleCount - allAttempts.length),
        averageScore: submitted.length
          ? Math.round((submitted.reduce((sum, attempt) => sum + attempt.score, 0) / submitted.length) * 100) / 100
          : 0,
        averagePercentage: percentages.length
          ? Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 100) / 100
          : 0,
        maxScore,
        passCount: submitted.filter((attempt) => attempt.passed).length,
        failCount: submitted.filter((attempt) => !attempt.passed).length,
        passPercentage: exam.settings.passPercentage,
        scoreDistribution: bands,
        itemStats,
        leaderboard,
        averageTimeSeconds: submitted.length ? Math.round(totalTime / submitted.length) : 0,
        averageTimePerQuestionSeconds:
          submitted.length && exam.items.length
            ? Math.round(totalTime / submitted.length / exam.items.length)
            : 0,
      });
    });
  }),
  http.post(`${API}/exams/:id/release-results`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');
      if (exam.status !== 'published') return fail(409, 'INVALID_STATE', 'Publish the exam before releasing results.');
      if (!exam.resultsReleasedAt) {
        exam.resultsReleasedAt = S.serverNowIso();
        S.persist();
      }
      return ok({ id: exam.id, resultsReleasedAt: exam.resultsReleasedAt });
    });
  }),
  http.get(`${API}/exams/:id/results/export.csv`, ({ request, params }) => {
    const auth = authorize(request, ['teacher', 'admin']);
    if (auth.error) return auth.error;
    return simulate(() => {
      const { exam, error } = findExamOrFail(params.id);
      if (error) return error;
      if (!manageExam(auth.user, exam)) return fail(403, 'FORBIDDEN', 'This exam belongs to another teacher.');

      const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows = S.state.attempts
        .filter((attempt) => attempt.examId === exam.id && attempt.status === 'submitted')
        .map((attempt) => {
          const student = S.findUser(attempt.studentId);
          return {
            studentName: student?.name || '',
            email: student?.email || '',
            status: attempt.status,
            score: attempt.score,
            maxScore: attempt.maxScore,
            percentage: attempt.percentage,
            passed: attempt.passed,
            submittedAt: attempt.submittedAt,
            violationCount: attempt.violationEvents.length,
          };
        })
        .sort((left, right) => right.score - left.score || left.studentName.localeCompare(right.studentName));

      const header = 'studentName,email,status,score,maxScore,percentage,passed,submittedAt,violationCount';
      const csv = [
        header,
        ...rows.map((row) =>
          [
            row.studentName,
            row.email,
            row.status,
            row.score,
            row.maxScore,
            row.percentage,
            row.passed,
            row.submittedAt,
            row.violationCount,
          ]
            .map(escape)
            .join(','),
        ),
      ].join('\n');

      return new HttpResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${exam.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-results.csv"`,
        },
      });
    });
  }),
];

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...questionHandlers,
  ...examHandlers,
  ...attemptHandlers,
  ...reportHandlers,
];

export const mockControls = {
  expireCurrentAttempt: () => {
    const attempt = S.state.attempts.find(
      (entry) => entry.studentId === S.state.currentUserId && entry.status === 'in_progress',
    );
    if (attempt) {
      attempt.expiresAt = new Date(S.getServerNow().getTime() + 20_000).toISOString();
      S.persist();
    }
  },
  failNextSave: () => {
    S.state.failNextSave = true;
  },
  goOffline: () => {
    S.state.offline = !S.state.offline;
  },
  skewClock: () => {
    S.state.serverClockOffsetMs += 120_000;
  },
  reset: () => {
    S.resetState();
  },
};

export const mockSnapshot = () => {
  const user = S.getCurrentUser();
  const attempt = S.state.attempts.find(
    (entry) => entry.studentId === user?.id && entry.status === 'in_progress',
  );
  return {
    user: S.publicUser(user),
    attempt,
    offline: S.state.offline,
    failNextSave: S.state.failNextSave,
    clockOffsetMs: S.state.serverClockOffsetMs,
  };
};
