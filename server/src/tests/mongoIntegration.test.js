import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../app.js';
import { createRepositoryFactory } from '../repositories/index.js';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp({ repos: createRepositoryFactory('mongo') });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) {
    if (model.collection?.name) await model.deleteMany({});
  }
});

describe('Mongo-backed Express integration', () => {
  it('registers, logs in, and reads the current user through Mongo repositories', async () => {
    const registered = await request(app).post('/api/v1/auth/register').send({
      name: 'Mongo Student',
      email: 'mongo.student@example.com',
      password: 'Passw0rd!',
    });

    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe('student');

    const loggedIn = await request(app).post('/api/v1/auth/login').send({
      email: 'mongo.student@example.com',
      password: 'Passw0rd!',
    });

    expect(loggedIn.status).toBe(200);
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loggedIn.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('mongo.student@example.com');
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
  });
});
