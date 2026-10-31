import request from 'supertest';
import XLSX from 'xlsx';

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

  it('imports an XLSX workbook', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ROWS[0]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const response = await upload('questions.xlsx', buffer);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ createdCount: 1, failedCount: 0 });
  });

  it('rejects a workbook without the required columns', async () => {
    const response = await upload('questions.csv', Buffer.from('subject,topic\nMathematics,Algebra'));
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(response.body.error.details.map((detail) => detail.path)).toContain('prompt');
  });

  it('rejects a file that is not CSV or XLSX', async () => {
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
