import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createRepositoryFactory } from '../repositories/index.js';
import { repositoryContract } from './repositories.test.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  for (const model of mongoose.models ? Object.values(mongoose.models) : []) {
    if (model.collection?.name) await model.deleteMany({});
  }
});

repositoryContract(() => createRepositoryFactory('mongo'));
