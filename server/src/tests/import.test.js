import request from 'supertest';

import { bearer, createUser, login, makeApp } from './helpers.js';

const API = '/api/v1';

const HEADERS = [
  'subject',
  'topic',
  'difficulty',
  'type',
  'prompt',
  'optiona',
  'optionb',
  'optionc',
  'optiond',
  'correctoptions',
  'numericanswer',
  'defaultmarks',
  'negativemarks',
];

const ROWS = [
  ['Mathematics', 'Algebra', 'easy', 'single_choice', 'What is one plus one?', 'One', 'Two', 'Three', '', 'b', '', '2', '0'],
  ['Physics', 'Mechanics', 'medium', 'numeric', 'What is the answer?', '', '', '', '', '', '42', '3', '0'],
  // Invalid: single choice without a correct option.
  ['English', 'Grammar', 'hard', 'single_choice', 'Which word is a noun?', '', '', '', '', '', '', '1', '0'],
];

const csv = [HEADERS, ...ROWS].map((row) => row.join(',')).join('\n');

describe('question import', () => {
  let app;
  let repo;
  let teacher;

  beforeEach(async () => {
    const created = makeApp();
    app = created.app;
    repo = created.repos;
    await createUser(repo, { name: 'Teacher', email: 'teacher@example.com', role: 'teacher' });
    teacher = await login(app, 'teacher@example.com', 'Passw0rd!');
  });

  const upload = (name, buffer) =>
    request(app).post(`${API}/questions/import`).set(bearer(teacher)).attach('file', buffer, name);

  it('imports valid CSV rows and reports invalid rows without failing the request', async () => {
    const response = await upload('questions.csv', Buffer.from(csv));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ createdCount: 2, failedCount: 1 });
    expect(response.body.data.errors[0]).toMatchObject({ row: 4, code: 'VALIDATION_ERROR' });

    const list = await request(app).get(`${API}/questions`).set(bearer(teacher));
    expect(list.body.meta.total).toBe(2);
    const owner = await repo.userRepo.findByEmail('teacher@example.com');
    expect(list.body.data.every((question) => question.createdBy === owner.id)).toBe(true);
  });

  it('imports quoted CSV fields containing commas and escaped quotes', async () => {
    const quotedCsv = [
      HEADERS.join(','),
      'Mathematics,Algebra,easy,single_choice,"Evaluate 1,000 + ""2,000""?",One,Two,"3,000",Four,c,,2,0',
    ].join('\n');

    const response = await upload('questions.csv', Buffer.from(quotedCsv));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ createdCount: 1, failedCount: 0 });
  });

  it('rejects XLSX uploads with 415 UNSUPPORTED_FILE_TYPE', async () => {
    const response = await upload('questions.xlsx', Buffer.from('PK\x03\x04'));
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a CSV file without the required columns', async () => {
    const response = await upload('questions.csv', Buffer.from('subject,topic\nMathematics,Algebra'));
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(response.body.error.details.map((detail) => detail.path)).toContain('prompt');
  });

  it('rejects a file that is not CSV', async () => {
    const response = await upload('questions.txt', Buffer.from(csv));
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('requires a file part', async () => {
    const response = await request(app).post(`${API}/questions/import`).set(bearer(teacher));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

