import request from 'supertest';

import { sweepExpiredAttempts } from '../jobs/autoSubmit.js';
import { bearer, createUser, login, makeApp, publishExam, questionInput } from './helpers.js';

const API = '/api/v1';

const setup = async () => {
  const { app, repos } = makeApp();
  await createUser(repos, { name: 'Teacher', email: 'teacher@example.com', role: 'teacher' });
  await createUser(repos, { name: 'Student', email: 'student@example.com', batchIds: ['CSE-A'] });
  const teacher = await login(app, 'teacher@example.com', 'Passw0rd!');
  const student = await login(app, 'student@example.com', 'Passw0rd!');
  return { app, repos, teacher, student };
};

const createQuestion = async (app, token, overrides) => {
  const response = await request(app).post(`${API}/questions`).set(bearer(token)).send(questionInput(overrides));
  if (response.status !== 201) throw new Error(`Question create failed: ${JSON.stringify(response.body)}`);
  return response.body.data;
};

const start = async (app, token, examId) =>
  request(app).post(`${API}/exams/${examId}/start`).set(bearer(token));

describe('exam lifecycle', () => {
  it('lets the owner reset a published schedule and delete the exam with its attempts', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'immediate' });

    const start = await request(app).post(`${API}/exams/${exam.id}/start`).set(bearer(student));
    expect(start.status).toBe(201);
    const nextStart = new Date(Date.now() + 10 * 60_000).toISOString();
    const nextEnd = new Date(Date.now() + 70 * 60_000).toISOString();
    const rescheduled = await request(app)
      .patch(`${API}/exams/${exam.id}`)
      .set(bearer(teacher))
      .send({ startAt: nextStart, endAt: nextEnd });
    expect(rescheduled.status).toBe(200);
    expect(rescheduled.body.data).toMatchObject({ startAt: nextStart, endAt: nextEnd, status: 'published' });

    const deleted = await request(app).delete(`${API}/exams/${exam.id}`).set(bearer(teacher));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ id: exam.id, deleted: true });
    expect((await request(app).get(`${API}/exams/${exam.id}`).set(bearer(teacher))).status).toBe(404);
    expect(await app.locals.repos.attemptRepo.listByExam(exam.id)).toHaveLength(0);
  });

  it('runs create → publish → start → autosave → submit → result end to end', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'immediate' });

    const available = await request(app).get(`${API}/exams/available`).set(bearer(student));
    expect(available.status).toBe(200);
    expect(available.body.data).toHaveLength(1);
    expect(available.body.data[0]).toMatchObject({ id: exam.id, availability: 'live', canStart: true });
    expect(available.body.data[0].joinCode).toBeUndefined();
    expect(available.body.data[0].items).toBeUndefined();

    const started = await start(app, student, exam.id);
    expect(started.status).toBe(201);
    expect(started.body.data.questions[0].question.correctOptionIds).toBeUndefined();
    expect(started.body.data.questions[0].question.numericAnswer).toBeUndefined();
    expect(started.body.data.questions[0].question.explanation).toBeUndefined();
    expect(started.body.data.serverTime).toEqual(expect.any(String));

    const attemptId = started.body.data.attemptId;
    const itemId = started.body.data.questions[0].id;

    const wrong = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId, selectedOptionIds: ['b'], clientSeq: 1 });
    expect(wrong.status).toBe(200);

    const stale = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId, selectedOptionIds: ['a'], clientSeq: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_CLIENT_SEQ');
    expect(stale.body.error.details[0].currentSeq).toBe(1);

    const correct = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId, selectedOptionIds: ['a'], clientSeq: 2 });
    expect(correct.status).toBe(200);
    expect(correct.body.data.clientSeq).toBe(2);
    expect(correct.body.data.serverTime).toEqual(expect.any(String));

    const submitted = await request(app).post(`${API}/attempts/${attemptId}/submit`).set(bearer(student));
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ status: 'submitted', resultAvailable: true });
    const submittedAt = submitted.body.data.submittedAt;

    const again = await request(app).post(`${API}/attempts/${attemptId}/submit`).set(bearer(student));
    expect(again.status).toBe(200);
    expect(again.body.data.submittedAt).toBe(submittedAt);

    const result = await request(app).get(`${API}/attempts/${attemptId}/result`).set(bearer(student));
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ score: 2, maxScore: 2, percentage: 100, passed: true });
    expect(result.body.data.items[0]).toMatchObject({ isCorrect: true, correctOptionIds: ['a'] });
    expect(result.body.data.student).toBeUndefined();
    expect(result.body.data.scoreHistory).toHaveLength(1);

    const teacherResult = await request(app).get(`${API}/attempts/${attemptId}/result`).set(bearer(teacher));
    expect(teacherResult.body.data.student).toMatchObject({ email: 'student@example.com' });
    expect(teacherResult.body.data.scoreHistory).toBeUndefined();

    const monitor = await request(app).get(`${API}/exams/${exam.id}/monitor`).set(bearer(teacher));
    expect(monitor.status).toBe(200);
    expect(monitor.body.data).toHaveLength(1);
    expect(monitor.body.data[0]).toMatchObject({ status: 'submitted', student: { email: 'student@example.com' } });
    expect(monitor.body.meta.counts).toEqual({ notStarted: 0, inProgress: 0, submitted: 1 });

    const results = await request(app).get(`${API}/exams/${exam.id}/results`).set(bearer(teacher));
    expect(results.body.data).toHaveLength(1);
    expect(results.body.data[0]).toMatchObject({ score: 2, percentage: 100, passed: true });

    const analytics = await request(app).get(`${API}/exams/${exam.id}/analytics`).set(bearer(teacher));
    expect(analytics.status).toBe(200);
    expect(analytics.body.data).toMatchObject({ submittedCount: 1, inProgressCount: 0, maxScore: 2 });
    expect(analytics.body.data.scoreDistribution).toHaveLength(10);
    expect(analytics.body.data.itemStats).toHaveLength(1);

    const csv = await request(app).get(`${API}/exams/${exam.id}/results/export.csv`).set(bearer(teacher));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.split('\n')[0]).toBe(
      'studentName,email,status,score,maxScore,percentage,passed,submittedAt,violationCount',
    );
    expect(csv.text).toContain('"Student","student@example.com","submitted",2,2,100,"true"');

    const release = await request(app).post(`${API}/exams/${exam.id}/release-results`).set(bearer(teacher));
    const releaseAgain = await request(app).post(`${API}/exams/${exam.id}/release-results`).set(bearer(teacher));
    expect(release.status).toBe(200);
    expect(releaseAgain.body.data.resultsReleasedAt).toBe(release.body.data.resultsReleasedAt);

    const attempted = await start(app, student, exam.id);
    expect(attempted.status).toBe(409);
    expect(attempted.body.error.code).toBe('ALREADY_ATTEMPTED');
  });

  it('hides results until an after_end exam ends or is released', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'after_end' });

    const started = await start(app, student, exam.id);
    const attemptId = started.body.data.attemptId;
    await request(app).post(`${API}/attempts/${attemptId}/submit`).set(bearer(student));

    const blocked = await request(app).get(`${API}/attempts/${attemptId}/result`).set(bearer(student));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RESULT_NOT_AVAILABLE');
    expect(blocked.body.error.details[0]).toHaveProperty('availableAt');

    await request(app).post(`${API}/exams/${exam.id}/release-results`).set(bearer(teacher));
    const released = await request(app).get(`${API}/attempts/${attemptId}/result`).set(bearer(student));
    expect(released.status).toBe(200);
  });

  it('auto-submits when the violation limit is reached', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], {
      resultMode: 'immediate',
      settings: { passPercentage: 40, violationLimit: 2, autoSubmitOnViolation: true },
    });
    const started = await start(app, student, exam.id);
    const attemptId = started.body.data.attemptId;

    const first = await request(app)
      .post(`${API}/attempts/${attemptId}/violation`)
      .set(bearer(student))
      .send({ type: 'tab_hidden' });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ violationCount: 1, autoSubmitted: false, attemptStatus: 'in_progress' });

    const second = await request(app)
      .post(`${API}/attempts/${attemptId}/violation`)
      .set(bearer(student))
      .send({ type: 'window_blur', meta: { key: 'x' } });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({
      violationCount: 2,
      maxViolations: 2,
      autoSubmitted: true,
      attemptStatus: 'submitted',
    });
    expect(second.body.data.submittedAt).toEqual(expect.any(String));

    const monitor = await request(app)
      .get(`${API}/exams/${exam.id}/monitor`)
      .set(bearer(teacher));
    expect(monitor.status).toBe(200);
    expect(monitor.body.data[0]).toMatchObject({
      violationCount: 2,
      violationSummary: { tab_hidden: 1, window_blur: 1 },
    });
    expect(monitor.body.data[0].violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tab_hidden' }),
        expect.objectContaining({ type: 'window_blur', meta: { key: 'x' } }),
      ]),
    );

    const blocked = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId: started.body.data.questions[0].id, selectedOptionIds: ['a'], clientSeq: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('INVALID_STATE');
  });

  it('lazily finalizes an expired attempt and rejects further answers', async () => {
    const { app, repos, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'immediate' });
    const started = await start(app, student, exam.id);
    const attemptId = started.body.data.attemptId;

    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    // The repository exposes no expiry setter; force the clock through its record.
    repos.attemptRepo._attempts.get(attemptId).expiresAt = expiredAt;

    const read = await request(app).get(`${API}/attempts/${attemptId}`).set(bearer(student));
    expect(read.body.data.status).toBe('submitted');
    expect(read.body.data.submittedAt).toBe(expiredAt);

    const blocked = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId: started.body.data.questions[0].id, selectedOptionIds: ['a'], clientSeq: 2 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ATTEMPT_EXPIRED');
  });

  it('accepts an answer that arrives within the five-second delivery grace', async () => {
    const { app, repos, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'immediate' });
    const started = await start(app, student, exam.id);
    const attemptId = started.body.data.attemptId;
    const itemId = started.body.data.questions[0].id;

    repos.attemptRepo._attempts.get(attemptId).expiresAt = new Date(Date.now() - 1_000).toISOString();

    const saved = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId, selectedOptionIds: ['a'], clientSeq: 1 });

    expect(saved.status).toBe(200);
    expect(saved.body.data.itemId).toBe(itemId);
    expect((await repos.attemptRepo.findById(attemptId)).status).toBe('in_progress');
  });

  it('sweeps expired attempts in batches with per-attempt isolation', async () => {
    const { app, repos, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], { resultMode: 'immediate' });
    const started = await start(app, student, exam.id);
    repos.attemptRepo._attempts.get(started.body.data.attemptId).expiresAt = new Date(
      Date.now() - 60_000,
    ).toISOString();

    const count = await sweepExpiredAttempts(repos);
    expect(count).toBe(1);
    expect((await repos.attemptRepo.findById(started.body.data.attemptId)).status).toBe('submitted');
  });

  it('starts only inside the live window', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id], {
      startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      endAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    });

    const response = await start(app, student, exam.id);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EXAM_NOT_LIVE');
  });

  it('lets a student join by code and becomes eligible', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam, published } = await publishExam(app, teacher, [question.id], {
      assignment: { batchIds: [], joinCodeEnabled: true },
    });

    const before = await request(app).get(`${API}/exams/available`).set(bearer(student));
    expect(before.body.data).toHaveLength(0);

    const joined = await request(app)
      .post(`${API}/exams/join`)
      .set(bearer(student))
      .send({ joinCode: published.joinCode.toLowerCase() });
    expect(joined.status).toBe(200);
    expect(joined.body.data).toMatchObject({ id: exam.id, attemptStatus: null });

    const after = await request(app).get(`${API}/exams/available`).set(bearer(student));
    expect(after.body.data).toHaveLength(1);

    const missing = await request(app)
      .post(`${API}/exams/join`)
      .set(bearer(student))
      .send({ joinCode: 'NOPE-0000' });
    expect(missing.status).toBe(404);
  });

  it('rejects an option that does not belong to the question', async () => {
    const { app, teacher, student } = await setup();
    const question = await createQuestion(app, teacher);
    const { exam } = await publishExam(app, teacher, [question.id]);
    const started = await start(app, student, exam.id);

    const response = await request(app)
      .patch(`${API}/attempts/${started.body.data.attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId: started.body.data.questions[0].id, selectedOptionIds: ['z'], clientSeq: 1 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('grades numeric and multiple-choice questions, with partial marking when enabled', async () => {
    const { app, teacher, student } = await setup();
    const numeric = await createQuestion(app, teacher, {
      type: 'numeric',
      prompt: 'What is 2 + 2?',
      options: [],
      correctOptionIds: [],
      numericAnswer: 4,
    });
    const multi = await createQuestion(app, teacher, {
      type: 'multiple_choice',
      prompt: 'Which are even?',
      options: [
        { id: 'a', text: '2' },
        { id: 'b', text: '4' },
        { id: 'c', text: '5' },
      ],
      correctOptionIds: ['a', 'b'],
    });
    const { exam } = await publishExam(
      app,
      teacher,
      [numeric.id, multi.id],
      {
        resultMode: 'immediate',
        settings: { passPercentage: 40, partialMarking: true, violationLimit: 3, autoSubmitOnViolation: true },
        items: [
          { questionId: numeric.id, marks: 2, negativeMarks: 0 },
          { questionId: multi.id, marks: 4, negativeMarks: 0 },
        ],
      },
    );
    const started = await start(app, student, exam.id);
    const attemptId = started.body.data.attemptId;
    const byQuestion = new Map(started.body.data.questions.map((item) => [item.question.type, item.id]));

    await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId: byQuestion.get('numeric'), numericValue: 4, clientSeq: 1 })
      .expect(200);
    await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student))
      .send({ itemId: byQuestion.get('multiple_choice'), selectedOptionIds: ['a'], clientSeq: 2 })
      .expect(200);
    await request(app).post(`${API}/attempts/${attemptId}/submit`).set(bearer(student)).expect(200);

    const result = await request(app).get(`${API}/attempts/${attemptId}/result`).set(bearer(student));
    expect(result.body.data.score).toBe(4);
    expect(result.body.data.maxScore).toBe(6);
  });
});
