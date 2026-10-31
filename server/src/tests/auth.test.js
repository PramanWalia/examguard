import request from 'supertest';

import { bearer, cookieFrom, createUser, login, makeApp } from './helpers.js';

describe('auth', () => {
  let app;
  let repos;

  beforeEach(() => {
    ({ app, repos } = makeApp());
  });

  it('registers a student, returns an access token, and sets an httpOnly refresh cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Asha Kumar', email: 'ASHA@example.com', password: 'Passw0rd!' });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ email: 'asha@example.com', role: 'student', isActive: true });
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    const cookie = response.headers['set-cookie'].find((value) => value.startsWith('refreshToken='));
    expect(cookie).toContain('HttpOnly');
    expect(cookieFrom(response)).toEqual(expect.any(String));
  });

  it('registers a teacher', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Priya Sharma', email: 'priya@example.com', password: 'Passw0rd!', role: 'teacher' });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('teacher');
    expect(response.body.data.user.isActive).toBe(true);
  });

  it('rejects self-registration as admin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'a@example.com', password: 'Passw0rd!', role: 'admin' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown body fields', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Asha', email: 'a@example.com', password: 'Passw0rd!', isActive: false });
    expect(response.status).toBe(400);
    expect(response.body.error.details[0]).toMatchObject({ path: 'isActive' });
  });

  it('rejects a duplicate email with 409 DUPLICATE_EMAIL', async () => {
    await createUser(repos, { email: 'dup@example.com' });
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Other', email: 'dup@example.com', password: 'Passw0rd!' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    await createUser(repos, { email: 'known@example.com', password: 'Passw0rd!' });
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'known@example.com', password: 'Nope1234!' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Passw0rd!' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
  });

  it('rejects an inactive account at login', async () => {
    await createUser(repos, { email: 'off@example.com', isActive: false });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'off@example.com', password: 'Passw0rd!' });
    expect(response.status).toBe(401);
  });

  it('logs in and returns the user without secrets', async () => {
    await createUser(repos, { email: 'login@example.com', password: 'Passw0rd!' });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'Passw0rd!' });
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('login@example.com');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rotates the refresh token and rejects the previous one', async () => {
    await createUser(repos, { email: 'rotate@example.com', password: 'Passw0rd!' });
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rotate@example.com', password: 'Passw0rd!' });
    const firstCookie = cookieFrom(loginResponse);

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    const secondCookie = cookieFrom(refreshed);
    expect(secondCookie).not.toBe(firstCookie);

    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstCookie);
    expect(replay.status).toBe(401);

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', secondCookie);
    expect(rotated.status).toBe(200);
  });

  it('rejects refresh without a cookie', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current user from /auth/me', async () => {
    await createUser(repos, { email: 'me@example.com', name: 'Me', password: 'Passw0rd!' });
    const token = await login(app, 'me@example.com', 'Passw0rd!');
    const response = await request(app).get('/api/v1/auth/me').set(bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email: 'me@example.com', name: 'Me', role: 'student' });
    expect(response.body.data.user).toBeUndefined();
  });

  it('requires a bearer token', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logs out, clears the cookie, and revokes the access token', async () => {
    await createUser(repos, { email: 'out@example.com', password: 'Passw0rd!' });
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'out@example.com', password: 'Passw0rd!' });
    const token = loginResponse.body.data.accessToken;

    const logout = await request(app).post('/api/v1/auth/logout').set(bearer(token));
    expect(logout.status).toBe(200);
    expect(logout.body.data.message).toBe('Logged out.');
    expect(logout.headers['set-cookie'][0]).toContain('refreshToken=;');

    const me = await request(app).get('/api/v1/auth/me').set(bearer(token));
    expect(me.status).toBe(401);
  });
});
