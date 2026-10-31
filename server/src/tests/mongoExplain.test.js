import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { AttemptModel } from '../models/attempt.js';
import { ExamModel } from '../models/exam.js';

let mongo;

const stages = (plan) => JSON.stringify(plan);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AttemptModel.syncIndexes(), ExamModel.syncIndexes()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Mongo query plans', () => {
  it('uses the expiry index for the cron sweep query', async () => {
    const plan = await AttemptModel.find({
      status: 'in_progress',
      expiresAt: { $lte: new Date() },
    }).sort({ expiresAt: 1 }).limit(100).explain('executionStats');

    expect(stages(plan)).toContain('status_1_expiresAt_1');
    expect(stages(plan)).not.toContain('"stage":"COLLSCAN"');
  });

  it('uses the teacher exam-list index', async () => {
    const plan = await ExamModel.find({
      createdBy: new mongoose.Types.ObjectId(),
      status: 'published',
    }).explain('executionStats');

    expect(stages(plan)).toContain('createdBy_1_status_1');
    expect(stages(plan)).not.toContain('"stage":"COLLSCAN"');
  });
});
