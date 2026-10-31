import request from 'supertest';

import { bearer, createUser, login, makeApp, questionInput } from './helpers.js';

const API = '/api/v1';

const appWithTeacher = async () => {
  const { app, repos } = makeApp();
  await createUser(repos, { name: 'Teacher', email: 'teacher@example.com', role: 'teacher' });
  return { app, repos, token: await login(app, 'teacher@example.com', 'Passw0rd!') };
};

describe('contract envelope', () => {
  it('serves an unauthenticated health envelope', async () => {
    const { app } = await appWithTeacher();
    const response = await request(app).get(`${API}/health`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
    expect(response.body.data.serverTime).toEqual(expect.any(String));
  });

  it('renders an unknown route as a NOT_FOUND error envelope', async () => {
    const { app } = await appWithTeacher();
    const response = await request(app).get(`${API}/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('rejects a non-ObjectId path param with a field-level validation error', async () => {
    const { app, token } = await appWithTeacher();
    const response = await request(app).get(`${API}/questions/not-an-id`).set(bearer(token));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'id', message: expect.any(String) }),
    );
  });

  it('rejects unknown body fields by name', async () => {
    const { app, token } = await appWithTeacher();
    const response = await request(app)
      .post(`${API}/questions`)
      .set(bearer(token))
      .send({ ...questionInput(), isActive: true });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'isActive', message: expect.any(String) }),
    );
  });

  it('rejects malformed JSON without leaking internals', async () => {
    const { app, token } = await appWithTeacher();
    const response = await request(app)
      .post(`${API}/questions`)
      .set(bearer(token))
      .set('Content-Type', 'application/json')
      .send('{"prompt":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the pagination meta keys the client reads', async () => {
    const { app, token } = await appWithTeacher();
    const response = await request(app).get(`${API}/questions?page=1&limit=20`).set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      facets: { subjects: [], topics: [] },
    });
  });

  it('returns NOT_FOUND for a well-formed id that does not exist', async () => {
    const { app, token } = await appWithTeacher();
    const response = await request(app).get(`${API}/questions/${'a'.repeat(24)}`).set(bearer(token));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400, not 500, when a partial patch leaves a question invalid', async () => {
    const { app, token } = await appWithTeacher();
    const created = await request(app)
      .post(`${API}/questions`)
      .set(bearer(token))
      .send(questionInput());
    const response = await request(app)
      .patch(`${API}/questions/${created.body.data.id}`)
      .set(bearer(token))
      .send({ type: 'numeric' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400, not 500, when a partial patch inverts the exam window', async () => {
    const { app, token } = await appWithTeacher();
    const created = await request(app).post(`${API}/exams`).set(bearer(token)).send({
      title: 'Draft exam',
      durationMinutes: 30,
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(created.status).toBe(201);
    const response = await request(app)
      .patch(`${API}/exams/${created.body.data.id}`)
      .set(bearer(token))
      .send({ startAt: new Date(Date.now() + 7_200_000).toISOString() });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks a password hash in an auth envelope', async () => {
    const { app } = await appWithTeacher();
    const response = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'teacher@example.com', password: 'Passw0rd!' });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('uses one error envelope shape for authentication failures', async () => {
    const { app } = await appWithTeacher();
    const response = await request(app).get(`${API}/auth/me`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });
});
