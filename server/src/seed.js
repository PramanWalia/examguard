import { pathToFileURL } from 'node:url';

import bcrypt from 'bcrypt';

import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createRepositoryFactory } from './repositories/index.js';
import { gradeAttempt } from './services/grading.js';
import { shuffle } from './utils/shuffle.js';

/**
 * Mirrors client/src/mocks/seed.js: same accounts, question bank, exams, live
 * window and attempts. The in-memory driver lives in one process, so this runs
 * at server start (and from `npm run seed` for a dry run).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const iso = (value) => new Date(value).toISOString();

const SUBJECT_TOPICS = {
  Mathematics: ['Algebra', 'Geometry', 'Probability'],
  'Computer Science': ['Algorithms', 'Databases', 'Networks'],
  Physics: ['Mechanics', 'Optics', 'Thermodynamics'],
  English: ['Grammar', 'Vocabulary', 'Comprehension'],
};
const SUBJECTS = Object.keys(SUBJECT_TOPICS);
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const OPTION_IDS = ['a', 'b', 'c', 'd'];

const questionInput = (index, createdBy, timestamp) => {
  const subject = SUBJECTS[index % SUBJECTS.length];
  const topics = SUBJECT_TOPICS[subject];
  const topic = topics[Math.floor(index / SUBJECTS.length) % topics.length];
  const type = ['single_choice', 'multiple_choice', 'numeric'][index % 3];
  const options =
    type === 'numeric'
      ? []
      : OPTION_IDS.map((id, optionIndex) => ({
          id,
          text: `${['First', 'Second', 'Third', 'Fourth'][optionIndex]} statement about ${topic}`,
        }));
  const correctOptionIds =
    type === 'single_choice'
      ? [OPTION_IDS[index % OPTION_IDS.length]]
      : type === 'multiple_choice'
        ? ['a', 'c']
        : [];

  return {
    subject,
    topic,
    difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
    type,
    prompt:
      type === 'numeric'
        ? `A ${topic} check gives a value of ${(index + 1) * 2}. What is twice that value?`
        : type === 'multiple_choice'
          ? `Which statements about ${topic} are correct? Select all that apply.`
          : `Which statement about ${topic} is correct?`,
    options,
    correctOptionIds,
    numericAnswer: type === 'numeric' ? (index + 1) * 2 : null,
    explanation: `This ${topic} item checks recall of the core rule demonstrated in the worked example.`,
    defaultMarks: index % 4 === 0 ? 2 : 1,
    negativeMarks: index % 7 === 0 ? 0.5 : 0,
    createdBy,
    createdAt: iso(timestamp),
    updatedAt: iso(timestamp),
  };
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

const buildQuestionSet = (exam) => {
  const settings = exam.settings || {};
  const items = exam.items.map((item) => ({
    id: item.id,
    questionId: item.questionId,
    order: item.order,
    marks: item.marks,
    negativeMarks: item.negativeMarks,
    question: {
      ...structuredClone(item.questionSnapshot),
      options: settings.shuffleOptions
        ? shuffle(item.questionSnapshot.options)
        : item.questionSnapshot.options,
    },
  }));
  return settings.shuffleQuestions ? shuffle(items) : items;
};

const makeAnswers = (questionSet, count, startedAt) =>
  Object.fromEntries(
    questionSet.slice(0, count).map((item, index) => {
      const correct = index % 2 === 0;
      let selectedOptionIds = [];
      let numericValue = null;
      if (item.question.type === 'numeric') {
        numericValue = correct
          ? item.question.numericAnswer
          : Number(item.question.numericAnswer) + 1;
      } else if (correct) {
        selectedOptionIds = [...item.question.correctOptionIds];
      } else {
        const wrong = item.question.options.find((option) => !item.question.correctOptionIds.includes(option.id));
        selectedOptionIds = wrong ? [wrong.id] : [];
      }
      return [
        item.id,
        {
          itemId: item.id,
          selectedOptionIds,
          numericValue,
          markedForReview: index === count - 1,
          clientSeq: index + 1,
          updatedAt: iso(startedAt + (index + 1) * 45_000),
        },
      ];
    }),
  );

const makeAttempt = (exam, studentId, { startedAt, submittedAt, answerCount, status, violationCount = 0 }) => {
  const settings = exam.settings || {};
  const questionSet = buildQuestionSet(exam);
  const answers = makeAnswers(questionSet, answerCount, startedAt);
  const attempt = {
    examId: exam.id,
    studentId,
    status,
    startedAt: iso(startedAt),
    expiresAt: iso(Math.min(startedAt + exam.durationMinutes * MINUTE, new Date(exam.endAt).getTime())),
    submittedAt: submittedAt ? iso(submittedAt) : null,
    questionSet,
    examSnapshot: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      endAt: exam.endAt,
      resultMode: exam.resultMode,
    },
    answers,
    violations: Array.from({ length: violationCount }, (_, index) => ({
      type: index % 2 === 0 ? 'tab_hidden' : 'fullscreen_exit',
      meta: {},
      occurredAt: iso(startedAt + (index + 1) * MINUTE),
    })),
    gradedPayload: null,
    finalizedBy: null,
    timeTakenSeconds: null,
  };

  if (status === 'submitted') {
    attempt.gradedPayload = gradeAttempt(questionSet, answers, {
      passPercentage: settings.passPercentage,
      partialMarking: settings.partialMarking,
      numericTolerance: settings.numericTolerance,
    });
    attempt.finalizedBy = 'submit';
    attempt.timeTakenSeconds = Math.min(
      Math.max(0, Math.round((submittedAt - startedAt) / 1000)),
      exam.durationMinutes * 60,
    );
  }
  return attempt;
};

const makeExam = async (examRepo, input) => {
  const exam = await examRepo.create({
    ...input,
    status: 'published',
    publishedAt: iso(Date.now() - 3 * DAY),
    createdAt: iso(Date.now() - 8 * DAY),
    updatedAt: iso(Date.now() - 3 * DAY),
    items: input.questions.map((question, index) => ({
      id: question.id,
      questionId: question.id,
      order: index + 1,
      marks: question.defaultMarks,
      negativeMarks: question.negativeMarks,
      questionSnapshot: snapshotOf(question),
    })),
  });
  return exam;
};

/**
 * Idempotent: does nothing when the repository already holds users.
 * @returns {Promise<{seeded: boolean, accounts: string[]}>}
 */
export const seedRepositories = async (repos, { force = false } = {}) => {
  if (force && config.REPOSITORY_DRIVER === 'mongo') {
    const { UserModel } = await import('./models/user.js');
    const { QuestionModel } = await import('./models/question.js');
    const { ExamModel } = await import('./models/exam.js');
    const { AttemptModel } = await import('./models/attempt.js');
    await Promise.all([
      UserModel.deleteMany({}),
      QuestionModel.deleteMany({}),
      ExamModel.deleteMany({}),
      AttemptModel.deleteMany({}),
    ]);
  }

  const existing = await repos.userRepo.list({ limit: 1 });
  if (existing.meta.total > 0 && !force) return { seeded: false, accounts: [] };

  const now = Date.now();
  const userCreatedAt = iso(now - 60 * DAY);
  const hashes = {
    admin: await bcrypt.hash('Admin1234', config.BCRYPT_ROUNDS),
    teacher: await bcrypt.hash('Teacher1234', config.BCRYPT_ROUNDS),
    student: await bcrypt.hash('Student1234', config.BCRYPT_ROUNDS),
  };

  const admin = await repos.userRepo.create({
    name: 'Platform Admin',
    email: 'admin@examguard.test',
    passwordHash: hashes.admin,
    role: 'admin',
    createdAt: iso(now - 90 * DAY),
    updatedAt: iso(now - 90 * DAY),
  });

  const teacher1 = await repos.userRepo.create({
    name: 'Priya Sharma',
    email: 'teacher1@examguard.test',
    passwordHash: hashes.teacher,
    role: 'teacher',
    createdAt: iso(now - 80 * DAY),
    updatedAt: iso(now - 80 * DAY),
  });
  const students = [];
  for (let index = 0; index < 2; index += 1) {
    const batch = index === 0 ? 'CSE-A' : 'CSE-B';
    students.push(
      await repos.userRepo.create({
        name: `Student ${String(index + 1).padStart(2, '0')}`,
        email: `student${index + 1}@examguard.test`,
        passwordHash: hashes.student,
        role: 'student',
        batchIds: index === 0 ? ['CSE-A', 'CSE-B'] : [batch],
        createdAt: userCreatedAt,
        updatedAt: userCreatedAt,
      }),
    );
  }

  const questions = [];
  for (let index = 0; index < 120; index += 1) {
    questions.push(
      await repos.questionRepo.create(
        questionInput(index, teacher1.id, now - 10 * DAY),
      ),
    );
  }

  const [, live, ended] = [
    await makeExam(repos.examRepo, {
      title: 'Advanced Algorithms — Midterm',
      description: 'Graph traversal, dynamic programming, and complexity analysis.',
      questions: questions.slice(0, 10),
      startAt: iso(now + 2 * HOUR),
      endAt: iso(now + 5 * HOUR),
      durationMinutes: 90,
      resultMode: 'after_end',
      assignment: { batchIds: ['CSE-A'], joinCodeEnabled: true },
      joinCode: 'ALG-2026',
      createdBy: teacher1.id,
    }),
    await makeExam(repos.examRepo, {
      title: 'Physics Fundamentals — Live Quiz',
      description: 'Mechanics and motion under timed conditions.',
      questions: questions.slice(20, 30),
      startAt: iso(now - 30 * MINUTE),
      endAt: iso(now + 90 * MINUTE),
      durationMinutes: 45,
      resultMode: 'immediate',
      settings: { violationLimit: 2 },
      assignment: { batchIds: ['CSE-A', 'CSE-B'], joinCodeEnabled: true },
      joinCode: 'PHY-LIVE',
      createdBy: teacher1.id,
    }),
    await makeExam(repos.examRepo, {
      title: 'English Grammar — Final Assessment',
      description: 'Sentence structure, usage, and precision.',
      questions: questions.slice(40, 50),
      startAt: iso(now - 4 * DAY),
      endAt: iso(now - 4 * DAY + HOUR),
      durationMinutes: 60,
      resultMode: 'manual',
      assignment: { batchIds: ['CSE-B'], joinCodeEnabled: true },
      joinCode: 'ENG-FINAL',
      resultsReleasedAt: iso(now - 3 * DAY),
      createdBy: teacher1.id,
    }),
  ];

  const attempts = [makeAttempt(ended, students[0].id, {
    startedAt: now - 4 * DAY + 5 * MINUTE,
    submittedAt: now - 4 * DAY + 35 * MINUTE,
    answerCount: 5,
    status: 'submitted',
    violationCount: 1,
  })];
  attempts.push(
    makeAttempt(live, students[1].id, {
      startedAt: now - 10 * MINUTE,
      answerCount: 3,
      status: 'in_progress',
    }),
  );
  for (const attempt of attempts) await repos.attemptRepo.create(attempt);

  return {
    seeded: true,
    accounts: [
      'admin@examguard.test / Admin1234',
      'teacher1@examguard.test / Teacher1234',
      'student1@examguard.test and student2@examguard.test / Student1234',
    ],
  };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const force = process.argv.includes('--force');
  if (config.REPOSITORY_DRIVER === 'mongo') await connectDatabase();
  const repos = createRepositoryFactory();
  const result = await seedRepositories(repos, { force });
  console.log(result.seeded ? `Seeded ${config.REPOSITORY_DRIVER} repositories.` : 'Repositories already contain users.');
  for (const account of result.accounts) console.log(`  ${account}`);
  if (config.REPOSITORY_DRIVER === 'memory') console.log('Note: the memory driver lives only inside a process. Run the server to serve seeded data.');
  if (config.REPOSITORY_DRIVER === 'mongo') await disconnectDatabase();
}
