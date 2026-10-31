import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { AttemptModel } from '../models/attempt.js';
import { MongoAttemptRepository } from '../repositories/mongo/attemptRepository.js';

describe('Mongo attempt repository concurrency', () => {
  let mongo;
  let repo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await AttemptModel.syncIndexes();
    repo = new MongoAttemptRepository();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  afterEach(async () => {
    await AttemptModel.deleteMany({});
  });

  it('creates one attempt when twenty starts race', async () => {
    const data = {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      questionSet: [],
      examSnapshot: { durationMinutes: 30 },
      answers: {},
      violations: [],
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => repo.createIfNoActive('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', data)),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await AttemptModel.countDocuments({})).toBe(1);
  }, 120_000);

  it('allows only one conditional finalization', async () => {
    const created = await repo.create({
      examId: '507f1f77bcf86cd799439011',
      studentId: '507f1f77bcf86cd799439012',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000),
      questionSet: [],
      examSnapshot: { durationMinutes: 30 },
    });
    const results = await Promise.all(
      Array.from({ length: 2 }, () => repo.finalizeIfInProgress(created.id, { score: 1 })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  }, 120_000);

  it('normalizes persisted answer arrays to keyed answers for grading', async () => {
    const created = await repo.create({
      examId: '507f1f77bcf86cd799439011',
      studentId: '507f1f77bcf86cd799439012',
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000),
      questionSet: [],
      examSnapshot: { durationMinutes: 30 },
      answers: {
        item1: {
          itemId: 'item1',
          selectedOptionIds: ['a'],
          clientSeq: 1,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const loaded = await repo.findById(created.id);
    expect(loaded.answers).toMatchObject({
      item1: { itemId: 'item1', selectedOptionIds: ['a'], clientSeq: 1 },
    });
  }, 120_000);
});
