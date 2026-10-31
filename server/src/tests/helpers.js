import bcrypt from 'bcrypt';
import request from 'supertest';

import { createApp } from '../app.js';
import { createRepositoryFactory } from '../repositories/index.js';

export const makeApp = (driver = 'memory') => {
  const repos = createRepositoryFactory(driver);
  return { app: createApp({ repos }), repos };
};

export const createUser = async (
  repos,
  { name = 'Test User', email = 'test@example.com', password = 'Passw0rd!', role = 'student', batchIds = [], isActive = true } = {},
) => {
  const passwordHash = await bcrypt.hash(password, 4);
  return repos.userRepo.create({ name, email, passwordHash, role, batchIds, isActive });
};

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export const login = async (app, email, password) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (response.status !== 200) throw new Error(`Login failed: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data.accessToken;
};

export const cookieFrom = (response) => {
  const header = response.headers['set-cookie']?.find((value) => value.startsWith('refreshToken='));
  return header?.split(';')[0];
};

export const questionInput = (overrides = {}) => ({
  subject: 'Computer Science',
  topic: 'Algorithms',
  difficulty: 'medium',
  type: 'single_choice',
  prompt: 'Which traversal visits the root first?',
  options: [
    { id: 'a', text: 'Preorder' },
    { id: 'b', text: 'Inorder' },
  ],
  correctOptionIds: ['a'],
  numericAnswer: null,
  explanation: 'Preorder visits the root first.',
  defaultMarks: 2,
  negativeMarks: 0,
  ...overrides,
});

export const examInput = (questionIds, overrides = {}) => ({
  title: 'Algorithms Midterm',
  description: 'Trees and graphs',
  durationMinutes: 30,
  startAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  endAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  resultMode: 'after_end',
  settings: { passPercentage: 40, violationLimit: 3, autoSubmitOnViolation: true },
  assignment: { batchIds: ['CSE-A'], joinCodeEnabled: true },
  items: questionIds.map((questionId) => ({ questionId, marks: 2, negativeMarks: 0 })),
  ...overrides,
});

/** Teacher creates + publishes an exam through the public API. */
export const publishExam = async (app, token, questionIds, overrides = {}) => {
  const created = await request(app)
    .post('/api/v1/exams')
    .set(bearer(token))
    .send(examInput(questionIds, overrides));
  if (created.status !== 201) throw new Error(`Exam create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const published = await request(app)
    .post(`/api/v1/exams/${created.body.data.id}/publish`)
    .set(bearer(token));
  if (published.status !== 200) throw new Error(`Publish failed: ${published.status} ${JSON.stringify(published.body)}`);
  return { exam: created.body.data, published: published.body.data };
};
