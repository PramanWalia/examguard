import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { seedRepositories } from '../seed.js';
import { createRepositoryFactory } from '../repositories/index.js';
import { UserModel } from '../models/user.js';
import { QuestionModel } from '../models/question.js';
import { ExamModel } from '../models/exam.js';
import { AttemptModel } from '../models/attempt.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

it('seeds the documented Mongo demo dataset idempotently', async () => {
  const repos = createRepositoryFactory('mongo');
  const first = await seedRepositories(repos);
  const second = await seedRepositories(repos);

  expect(first.seeded).toBe(true);
  expect(second.seeded).toBe(false);
  expect(await UserModel.countDocuments()).toBe(4);
  expect(await QuestionModel.countDocuments()).toBe(120);
  expect(await ExamModel.countDocuments()).toBe(3);
  expect(await AttemptModel.countDocuments()).toBe(2);
});
