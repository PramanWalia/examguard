import { gradeAttempt } from './grading';

const oid = (value) => value.toString(16).padStart(24, '0');
const iso = (value) => new Date(value).toISOString();

export const STORAGE_KEY = 'examguard-mock-state-v1';

const SUBJECT_TOPICS = {
  Mathematics: ['Algebra', 'Geometry', 'Probability'],
  'Computer Science': ['Algorithms', 'Databases', 'Networks'],
  Physics: ['Mechanics', 'Optics', 'Thermodynamics'],
  English: ['Grammar', 'Vocabulary', 'Comprehension'],
};

const SUBJECTS = Object.keys(SUBJECT_TOPICS);
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const OPTION_IDS = ['a', 'b', 'c', 'd'];

export const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

const makeQuestion = (index) => {
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
    id: oid(0x100 + index),
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
    createdBy: index < 30 ? oid(0x2) : oid(0x3),
    createdAt: iso(Date.now() - 10 * 24 * 60 * 60 * 1000),
    updatedAt: iso(Date.now() - 10 * 24 * 60 * 60 * 1000),
  };
};

const snapshot = (question) => ({
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

const makeExam = ({ id, teacherId, title, description, questions, startAt, endAt, durationMinutes, resultMode, batchIds, joinCode, resultsReleasedAt, settings = {}, examNumber }) => ({
  id,
  title,
  description,
  durationMinutes,
  startAt: iso(startAt),
  endAt: iso(endAt),
  status: 'published',
  resultMode,
  settings: {
    shuffleQuestions: true,
    shuffleOptions: true,
    passPercentage: 40,
    violationLimit: 3,
    autoSubmitOnViolation: true,
    ...settings,
  },
  assignment: { batchIds, joinCodeEnabled: true },
  joinCode,
  items: questions.map((question, index) => ({
    id: oid(0x300 + examNumber * 100 + index),
    questionId: question.id,
    order: index + 1,
    marks: question.defaultMarks,
    negativeMarks: question.negativeMarks,
    questionSnapshot: snapshot(question),
  })),
  createdBy: teacherId,
  publishedAt: iso(Date.now() - 3 * 24 * 60 * 60 * 1000),
  resultsReleasedAt: resultsReleasedAt ? iso(resultsReleasedAt) : null,
  createdAt: iso(Date.now() - 8 * 24 * 60 * 60 * 1000),
  updatedAt: iso(Date.now() - 3 * 24 * 60 * 60 * 1000),
});

const makeUser = (index, overrides) => ({
  id: oid(index),
  name: `Student ${String(index - 0x10 + 1).padStart(2, '0')}`,
  email: `student${index - 0x10 + 1}@examguard.test`,
  role: 'student',
  batchIds: [],
  isActive: true,
  password: 'Student1234',
  createdAt: iso(Date.now() - 60 * 24 * 60 * 60 * 1000),
  updatedAt: iso(Date.now() - 60 * 24 * 60 * 60 * 1000),
  ...overrides,
});

export const buildQuestionSet = (exam) => {
  const items = exam.items.map((item) => ({
    id: item.id,
    questionId: item.questionId,
    order: item.order,
    marks: item.marks,
    negativeMarks: item.negativeMarks,
    question: {
      ...item.questionSnapshot,
      options: exam.settings.shuffleOptions
        ? shuffle(item.questionSnapshot.options)
        : item.questionSnapshot.options,
    },
  }));
  return exam.settings.shuffleQuestions ? shuffle(items) : items;
};

const makeAnswers = (questionSet, count, startedAt) =>
  Object.fromEntries(
    questionSet.slice(0, count).map((item, index) => {
      const correct = index % 2 === 0;
      let selectedOptionIds = [];
      let numericValue = null;

      if (item.question.type === 'numeric') {
        numericValue = correct ? item.question.numericAnswer : Number(item.question.numericAnswer) + 1;
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

const makeAttempt = ({ id, exam, studentId, startedAt, submittedAt, answerCount, status, violationCount = 0 }) => {
  const questionSet = buildQuestionSet(exam);
  const answers = makeAnswers(questionSet, answerCount, startedAt);
  const attempt = {
    id,
    examId: exam.id,
    studentId,
    status,
    startedAt: iso(startedAt),
    submittedAt: submittedAt ? iso(submittedAt) : null,
    expiresAt: iso(Math.min(startedAt + exam.durationMinutes * 60_000, new Date(exam.endAt).getTime())),
    answers,
    lastClientSeq: answerCount,
    violationEvents: Array.from({ length: violationCount }, (_, index) => ({
      type: index % 2 === 0 ? 'tab_hidden' : 'fullscreen_exit',
      meta: {},
      occurredAt: iso(startedAt + (index + 1) * 60_000),
    })),
    questionSet,
    finalizedBy: status === 'submitted' ? 'submit' : null,
    score: null,
    maxScore: null,
    percentage: null,
    passed: null,
    timeTakenSeconds: null,
  };

  if (status === 'submitted') {
    const grade = gradeAttempt(questionSet, answers, exam.settings.passPercentage);
    attempt.score = grade.score;
    attempt.maxScore = grade.maxScore;
    attempt.percentage = grade.percentage;
    attempt.passed = grade.passed;
    attempt.timeTakenSeconds = Math.min(
      Math.max(0, Math.round((new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 1000)),
      exam.durationMinutes * 60,
    );
  }

  return attempt;
};

export const createInitialState = () => {
  const now = Date.now();
  const questions = Array.from({ length: 60 }, (_, index) => makeQuestion(index));
  const students = Array.from({ length: 20 }, (_, index) => {
    const batch =
      index < 8 ? 'CSE-A' : index < 16 ? 'CSE-B' : 'ECE-A';
    return makeUser(0x10 + index, {
      batchIds: index === 0 ? ['CSE-A', 'CSE-B'] : [batch],
    });
  });

  const users = [
    {
      id: oid(0x1),
      name: 'Priya Sharma',
      email: 'teacher1@examguard.test',
      role: 'teacher',
      batchIds: [],
      isActive: true,
      password: 'Teacher1234',
      createdAt: iso(now - 80 * 24 * 60 * 60 * 1000),
      updatedAt: iso(now - 80 * 24 * 60 * 60 * 1000),
    },
    {
      id: oid(0x2),
      name: 'Rohan Mehta',
      email: 'teacher2@examguard.test',
      role: 'teacher',
      batchIds: [],
      isActive: true,
      password: 'Teacher1234',
      createdAt: iso(now - 80 * 24 * 60 * 60 * 1000),
      updatedAt: iso(now - 80 * 24 * 60 * 60 * 1000),
    },
    ...students,
  ];

  const exams = [
    makeExam({
      id: oid(0x201),
      examNumber: 1,
      teacherId: oid(0x2),
      title: 'Advanced Algorithms — Midterm',
      description: 'Graph traversal, dynamic programming, and complexity analysis.',
      questions: questions.slice(0, 10),
      startAt: now + 2 * 60 * 60 * 1000,
      endAt: now + 5 * 60 * 60 * 1000,
      durationMinutes: 90,
      resultMode: 'after_end',
      batchIds: ['CSE-A'],
      joinCode: 'ALG-2026',
    }),
    makeExam({
      id: oid(0x202),
      examNumber: 2,
      teacherId: oid(0x2),
      title: 'Physics Fundamentals — Live Quiz',
      description: 'Mechanics and motion under timed conditions.',
      questions: questions.slice(20, 30),
      startAt: now - 30 * 60 * 1000,
      endAt: now + 90 * 60 * 1000,
      durationMinutes: 45,
      resultMode: 'immediate',
      batchIds: ['CSE-A', 'CSE-B'],
      joinCode: 'PHY-LIVE',
      settings: { violationLimit: 2 },
    }),
    makeExam({
      id: oid(0x203),
      examNumber: 3,
      teacherId: oid(0x3),
      title: 'English Grammar — Final Assessment',
      description: 'Sentence structure, usage, and precision.',
      questions: questions.slice(40, 50),
      startAt: now - 4 * 24 * 60 * 60 * 1000,
      endAt: now - 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
      durationMinutes: 60,
      resultMode: 'manual',
      batchIds: ['CSE-B'],
      joinCode: 'ENG-FINAL',
      resultsReleasedAt: now - 3 * 24 * 60 * 60 * 1000,
    }),
  ];

  const liveExam = exams[1];
  const endedExam = exams[2];
  const attempts = [
    makeAttempt({
      id: oid(0x410),
      exam: endedExam,
      studentId: oid(0x10),
      startedAt: now - 4 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
      submittedAt: now - 4 * 24 * 60 * 60 * 1000 + 50 * 60 * 1000,
      answerCount: 8,
      status: 'submitted',
      violationCount: 1,
    }),
    makeAttempt({
      id: oid(0x411),
      exam: endedExam,
      studentId: oid(0x18),
      startedAt: now - 4 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000,
      submittedAt: now - 4 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000,
      answerCount: 7,
      status: 'submitted',
    }),
    makeAttempt({
      id: oid(0x420),
      exam: liveExam,
      studentId: oid(0x12),
      startedAt: now - 10 * 60 * 1000,
      answerCount: 3,
      status: 'in_progress',
    }),
    makeAttempt({
      id: oid(0x421),
      exam: liveExam,
      studentId: oid(0x13),
      startedAt: now - 20 * 60 * 1000,
      answerCount: 5,
      status: 'in_progress',
      violationCount: 1,
    }),
    makeAttempt({
      id: oid(0x422),
      exam: liveExam,
      studentId: oid(0x14),
      startedAt: now - 40 * 60 * 1000,
      submittedAt: now - 8 * 60 * 1000,
      answerCount: 10,
      status: 'submitted',
    }),
    makeAttempt({
      id: oid(0x423),
      exam: liveExam,
      studentId: oid(0x15),
      startedAt: now - 35 * 60 * 1000,
      submittedAt: now - 6 * 60 * 1000,
      answerCount: 7,
      status: 'submitted',
      violationCount: 2,
    }),
  ];

  return {
    __version: 1,
    users,
    questions,
    exams,
    attempts,
    joinedExamIdsByStudent: {},
    currentUserId: null,
    serverClockOffsetMs: 0,
    failNextSave: false,
    offline: false,
    randomFailureRate: 0.02,
  };
};
