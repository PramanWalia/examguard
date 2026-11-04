import request from 'supertest';

import { validateEnv } from '../config/env.js';
import { createRepositoryFactory } from '../repositories/index.js';
import { seedRepositories } from '../seed.js';
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

  it('registers a teacher without inviteCode as pending admin approval and blocks login until approved', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Priya Sharma', email: 'priya@example.com', password: 'Passw0rd!', role: 'teacher' });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('teacher');
    expect(response.body.data.user.isActive).toBe(false);
    expect(response.body.data.user.approvalStatus).toBe('pending');
    expect(response.body.data.pendingApproval).toBe(true);
    expect(response.body.data.accessToken).toBeNull();

    const blockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'priya@example.com', password: 'Passw0rd!' });
    expect(blockedLogin.status).toBe(401);

    await createUser(repos, { name: 'Admin', email: 'admin@example.com', role: 'admin' });
    const adminToken = await login(app, 'admin@example.com', 'Passw0rd!');
    const approve = await request(app)
      .patch(`/api/v1/users/${response.body.data.user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: true });
    expect(approve.status).toBe(200);
    expect(approve.body.data.isActive).toBe(true);
    expect(approve.body.data.approvalStatus).toBe('approved');

    const activeLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'priya@example.com', password: 'Passw0rd!' });
    expect(activeLogin.status).toBe(200);
  });

  it('registers a teacher with a valid inviteCode as immediately active and rejects an invalid inviteCode', async () => {
    const { config } = await import('../config/env.js');
    const prevCode = config.TEACHER_INVITE_CODE;
    config.TEACHER_INVITE_CODE = 'FACULTY-2026';

    try {
      const invalid = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Wrong Code',
          email: 'wrong@example.com',
          password: 'Passw0rd!',
          role: 'teacher',
          inviteCode: 'WRONG-CODE',
        });
      expect(invalid.status).toBe(403);
      expect(invalid.body.error.code).toBe('INVALID_INVITE_CODE');

      const valid = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Approved Teacher',
          email: 'approved@example.com',
          password: 'Passw0rd!',
          role: 'teacher',
          inviteCode: 'FACULTY-2026',
        });
      expect(valid.status).toBe(201);
      expect(valid.body.data.user).toMatchObject({
        email: 'approved@example.com',
        role: 'teacher',
        isActive: true,
        approvalStatus: 'approved',
      });
      expect(valid.body.data.accessToken).toEqual(expect.any(String));
    } finally {
      config.TEACHER_INVITE_CODE = prevCode;
    }
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

  it('rotates the refresh token per session and rejects replay without invalidating other active sessions', async () => {
    await createUser(repos, { email: 'rotate@example.com', password: 'Passw0rd!' });
    const tab1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rotate@example.com', password: 'Passw0rd!' });
    const tab2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rotate@example.com', password: 'Passw0rd!' });

    const tab1Cookie1 = cookieFrom(tab1Login);
    const tab2Cookie1 = cookieFrom(tab2Login);
    const tab2AccessToken = tab2Login.body.data.accessToken;

    const refreshedTab1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', tab1Cookie1);
    expect(refreshedTab1.status).toBe(200);
    expect(refreshedTab1.body.data.accessToken).toEqual(expect.any(String));
    const tab1Cookie2 = cookieFrom(refreshedTab1);
    expect(tab1Cookie2).not.toBe(tab1Cookie1);

    // Tab 2's access token and refresh token remain valid even after Tab 1 refreshed.
    const tab2Me = await request(app).get('/api/v1/auth/me').set(bearer(tab2AccessToken));
    expect(tab2Me.status).toBe(200);
    const refreshedTab2 = await request(app).post('/api/v1/auth/refresh').set('Cookie', tab2Cookie1);
    expect(refreshedTab2.status).toBe(200);

    // Replaying Tab 1's old refresh token is rejected and revokes Tab 1's session family.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', tab1Cookie1);
    expect(replay.status).toBe(401);

    const revokedFamily = await request(app).post('/api/v1/auth/refresh').set('Cookie', tab1Cookie2);
    expect(revokedFamily.status).toBe(401);
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

  it('logs out, clears the cookie, and revokes the session access token', async () => {
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

  it('refuses SEED_ON_START and REPOSITORY_DRIVER=memory in production', async () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        REPOSITORY_DRIVER: 'memory',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/examguard',
        JWT_ACCESS_SECRET: 'prod-access-secret-that-is-at-least-32-chars',
        JWT_REFRESH_SECRET: 'prod-refresh-secret-that-is-at-least-32-chars',
        SEED_ON_START: 'false',
      }),
    ).toThrow(/REPOSITORY_DRIVER=mongo/);

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        REPOSITORY_DRIVER: 'mongo',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/examguard',
        JWT_ACCESS_SECRET: 'prod-access-secret-that-is-at-least-32-chars',
        JWT_REFRESH_SECRET: 'prod-refresh-secret-that-is-at-least-32-chars',
        SEED_ON_START: 'true',
      }),
    ).toThrow(/SEED_ON_START=true/);

    expect(() => createRepositoryFactory('memory', { nodeEnv: 'production' })).toThrow(/not allowed in production/i);
    await expect(seedRepositories(repos, { nodeEnv: 'production' })).rejects.toThrow(/disabled in production/i);
  });
});

