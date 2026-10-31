import { createRepositoryFactory } from '../repositories/index.js';

const baseAttempt = (overrides = {}) => ({
  status: 'in_progress',
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  questionSet: [],
  examSnapshot: { durationMinutes: 30 },
  answers: {},
  violations: [],
  ...overrides,
});
const EXAM_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f1f77bcf86cd799439012';

export const repositoryContract = (createRepos) => {
  describe('repository contract', () => {
    let repos;

    beforeEach(() => {
      repos = createRepos();
    });

    it('creates one user and rejects a duplicate email', async () => {
      await repos.userRepo.create({ name: 'A', email: 'a@example.com', passwordHash: 'x', role: 'student' });
      await expect(
        repos.userRepo.create({ name: 'B', email: 'A@example.com', passwordHash: 'x', role: 'student' }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
    });

  it('returns the existing in-progress attempt instead of creating a second one', async () => {
    const first = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    const second = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reason).toBe('in_progress');
    expect(second.attempt.id).toBe(first.attempt.id);
    });
  it('does not create a second attempt after maxAttempts is reached', async () => {
    const first = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    await repos.attemptRepo.finalizeIfInProgress(first.attempt.id, { score: 1 });

    const second = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt(), {
      maxAttempts: 1,
      });
    expect(second).toMatchObject({ attempt: null, created: false, reason: 'max_attempts' });
  });

  it('allows only one concurrent attempt creation', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt())),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await repos.attemptRepo.listByExam(EXAM_ID)).toHaveLength(1);
  });

  it('rejects a stale clientSeq and accepts a newer one', async () => {
    const { attempt } = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    const now = new Date().toISOString();

    const saved = await repos.attemptRepo.saveAnswerIfNewer(
      attempt.id,
      'item-1',
      { selectedOptionIds: ['a'], numericValue: null, markedForReview: false },
      5,
      now,
    );
    expect(saved.clientSeq).toBe(5);

    const stale = await repos.attemptRepo.saveAnswerIfNewer(
      attempt.id,
      'item-1',
      { selectedOptionIds: ['b'], numericValue: null, markedForReview: false },
      5,
      now,
    );
    expect(stale).toBeNull();

    const newer = await repos.attemptRepo.saveAnswerIfNewer(
      attempt.id,
      'item-1',
      { selectedOptionIds: ['c'], numericValue: null, markedForReview: true },
      6,
      now,
    );
    expect(newer.selectedOptionIds).toEqual(['c']);
  });

  it('refuses answer writes after submission', async () => {
    const { attempt } = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    await repos.attemptRepo.finalizeIfInProgress(attempt.id, { score: 1 });
    const saved = await repos.attemptRepo.saveAnswerIfNewer(
      attempt.id,
      'item-1',
      { selectedOptionIds: ['a'] },
      1,
      new Date().toISOString(),
    );
    expect(saved).toBeNull();
  });

  it('finalizes an attempt only once', async () => {
    const { attempt } = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    const first = await repos.attemptRepo.finalizeIfInProgress(attempt.id, { score: 10 });
    const second = await repos.attemptRepo.finalizeIfInProgress(attempt.id, { score: 99 });

    expect(first.status).toBe('submitted');
    expect(first.gradedPayload.score).toBe(10);
    expect(second).toBeNull();
  });

  it('records violations, capped at the newest entries', async () => {
    const { attempt } = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt());
    await repos.attemptRepo.recordViolation(attempt.id, { type: 'tab_hidden', meta: { a: 1 } }, { cap: 2 });
    await repos.attemptRepo.recordViolation(attempt.id, { type: 'copy' }, { cap: 2 });
    const latest = await repos.attemptRepo.recordViolation(attempt.id, { type: 'paste' }, { cap: 2 });
    expect(latest.violations.map((entry) => entry.type)).toEqual(['copy', 'paste']);
  });

  it('finds only expired in-progress attempts, oldest first, limited', async () => {
    const past = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
    const first = await repos.attemptRepo.createIfNoActive(EXAM_ID, STUDENT_ID, baseAttempt({ expiresAt: past(20) }));
    await repos.attemptRepo.createIfNoActive('507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014', baseAttempt({ expiresAt: past(10) }));
    await repos.attemptRepo.createIfNoActive('507f1f77bcf86cd799439013', '507f1f77bcf86cd799439015', baseAttempt());
    await repos.attemptRepo.createIfNoActive('507f1f77bcf86cd799439016', '507f1f77bcf86cd799439017', baseAttempt({ expiresAt: past(30) }));

    const expired = await repos.attemptRepo.findExpiredInProgress(new Date().toISOString(), 1);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).not.toBe(first.attempt.id);
  });

  it('publishes only a draft that has items', async () => {
    const teacher = await repos.userRepo.create({
      name: 'T',
      email: 't@example.com',
      passwordHash: 'x',
      role: 'teacher',
    });
    const exam = await repos.examRepo.create({
      title: 'Exam',
      durationMinutes: 30,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      createdBy: teacher.id,
      items: [],
    });
    const published = await repos.examRepo.publish(exam.id, teacher.id, { items: [], totalMarks: 0 });
    expect(published).toBeNull();
  });

  it('analytics returns ten distribution bands', async () => {
    const teacher = await repos.userRepo.create({
      name: 'T',
      email: 't@example.com',
      passwordHash: 'x',
      role: 'teacher',
    });
    const exam = await repos.examRepo.create({
      title: 'Exam',
      durationMinutes: 30,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      createdBy: teacher.id,
    });
    const bands = await repos.analyticsRepo.scoreDistribution(exam.id);
    expect(bands).toHaveLength(10);
    expect(bands[0]).toMatchObject({ label: '0-9', min: 0, max: 9, count: 0 });
  });

  it('exam repository list includes meta.summary and meta.batches', async () => {
    const teacher = await repos.userRepo.create({
      name: 'Teacher T',
      email: 'teacher-meta@example.com',
      passwordHash: 'x',
      role: 'teacher',
    });
    await repos.examRepo.create({
      title: 'Meta Test Exam',
      durationMinutes: 45,
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      endAt: new Date(Date.now() + 7_200_000).toISOString(),
      createdBy: teacher.id,
      assignment: { batchIds: ['BATCH-X'] },
      items: [],
    });
    const result = await repos.examRepo.list({ createdBy: teacher.id });
    expect(result.meta).toHaveProperty('summary');
    expect(result.meta.summary).toHaveProperty('draft');
    expect(result.meta).toHaveProperty('batches');
    expect(Array.isArray(result.meta.batches)).toBe(true);
    expect(result.meta.batches.some((b) => b.id === 'BATCH-X')).toBe(true);
  });
  });
};

repositoryContract(() => createRepositoryFactory('memory'));
