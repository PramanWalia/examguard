import request from 'supertest';

import { bearer, createUser, login, makeApp, publishExam, questionInput } from './helpers.js';

const API = '/api/v1';

const setup = async () => {
  const { app, repos } = makeApp();
  await createUser(repos, { name: 'Admin', email: 'admin@example.com', role: 'admin' });
  await createUser(repos, { name: 'Teacher One', email: 't1@example.com', role: 'teacher' });
  await createUser(repos, { name: 'Teacher Two', email: 't2@example.com', role: 'teacher' });
  await createUser(repos, { name: 'Student One', email: 's1@example.com', batchIds: ['CSE-A'] });
  await createUser(repos, { name: 'Student Two', email: 's2@example.com', batchIds: ['CSE-A'] });
  return {
    app,
    repos,
    admin: await login(app, 'admin@example.com', 'Passw0rd!'),
    teacher1: await login(app, 't1@example.com', 'Passw0rd!'),
    teacher2: await login(app, 't2@example.com', 'Passw0rd!'),
    student1: await login(app, 's1@example.com', 'Passw0rd!'),
    student2: await login(app, 's2@example.com', 'Passw0rd!'),
  };
};

describe('authorization table', () => {
  it('rejects unauthenticated requests to every protected route', async () => {
    const { app, repos } = await setup();
    const question = await repos.questionRepo.create({ ...questionInput(), createdBy: 'someone' });
    const routes = [
      ['get', `${API}/auth/me`],
      ['get', `${API}/users`],
      ['get', `${API}/questions`],
      ['get', `${API}/exams`],
      ['get', `${API}/exams/available`],
      ['get', `${API}/exams/${question.id}`],
      ['get', `${API}/attempts/${question.id}`],
    ];
    for (const [method, path] of routes) {
      const response = await request(app)[method](path);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('enforces role gates across roles', async () => {
    const { app, teacher1, teacher2, student1, admin } = await setup();
    const question = (
      await request(app).post(`${API}/questions`).set(bearer(teacher1)).send(questionInput())
    ).body.data;
    const { exam } = await publishExam(app, teacher1, [question.id]);

    const cases = [
      // admin-only
      ['get', `${API}/users`, student1, 403],
      ['get', `${API}/users`, teacher1, 403],
      ['get', `${API}/users`, admin, 200],
      // teacher/admin
      ['get', `${API}/questions`, student1, 403],
      ['post', `${API}/questions`, student1, 403],
      ['get', `${API}/exams`, student1, 403],
      ['post', `${API}/exams`, student1, 403],
      // student-only
      ['get', `${API}/exams/available`, teacher1, 403],
      ['post', `${API}/exams/join`, teacher1, 403],
      ['post', `${API}/exams/${exam.id}/start`, teacher1, 403],
      // ownership: other teacher is forbidden, owner and admin are allowed
      ['get', `${API}/questions/${question.id}`, teacher2, 403],
      ['get', `${API}/questions/${question.id}`, teacher1, 200],
      ['get', `${API}/questions/${question.id}`, admin, 200],
      ['get', `${API}/exams/${exam.id}/monitor`, teacher2, 403],
      ['get', `${API}/exams/${exam.id}/monitor`, teacher1, 200],
      ['get', `${API}/exams/${exam.id}/monitor`, admin, 200],
      ['get', `${API}/exams/${exam.id}/results`, teacher2, 403],
      ['get', `${API}/exams/${exam.id}/analytics`, teacher2, 403],
      ['post', `${API}/exams/${exam.id}/release-results`, teacher2, 403],
      ['get', `${API}/exams/${exam.id}/results/export.csv`, teacher2, 403],
      ['patch', `${API}/exams/${exam.id}`, teacher2, 403],
    ];

    for (const [method, path, token, status] of cases) {
      const response = await request(app)[method](path).set(bearer(token));
      expect({ method, path, status: response.status }).toEqual({ method, path, status });
    }
  });

  it('stops a student from reading or writing another student’s attempt', async () => {
    const { app, teacher1, student1, student2 } = await setup();
    const question = (
      await request(app).post(`${API}/questions`).set(bearer(teacher1)).send(questionInput())
    ).body.data;
    const { exam } = await publishExam(app, teacher1, [question.id]);
    const started = await request(app).post(`${API}/exams/${exam.id}/start`).set(bearer(student1));
    const attemptId = started.body.data.attemptId;
    const itemId = started.body.data.questions[0].id;

    const reads = await request(app).get(`${API}/attempts/${attemptId}`).set(bearer(student2));
    expect(reads.status).toBe(403);

    const writes = await request(app)
      .patch(`${API}/attempts/${attemptId}/answer`)
      .set(bearer(student2))
      .send({ itemId, selectedOptionIds: ['a'], clientSeq: 1 });
    expect(writes.status).toBe(403);

    const submits = await request(app).post(`${API}/attempts/${attemptId}/submit`).set(bearer(student2));
    expect(submits.status).toBe(403);

    const owner = await request(app).get(`${API}/attempts/${attemptId}`).set(bearer(student1));
    expect(owner.status).toBe(200);
  });

  it('allows admins to delete another account but not themselves', async () => {
    const { app, repos, admin } = await setup();
    const student = await repos.userRepo.findByEmail('s1@example.com');
    const deleted = await request(app).delete(`${API}/users/${student.id}`).set(bearer(admin));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ id: student.id, deleted: true });

    const self = await repos.userRepo.findByEmail('admin@example.com');
    const selfDelete = await request(app).delete(`${API}/users/${self.id}`).set(bearer(admin));
    expect(selfDelete.status).toBe(409);
  });
});
