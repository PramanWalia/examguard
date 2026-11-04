import { config } from '../config/env.js';
import { MemoryAnalyticsRepository } from './memory/analyticsRepository.js';
import { MemoryAttemptRepository } from './memory/attemptRepository.js';
import { MemoryExamRepository } from './memory/examRepository.js';
import { MemoryQuestionRepository } from './memory/questionRepository.js';
import { MemoryUserRepository } from './memory/userRepository.js';
import { MongoAnalyticsRepository } from './mongo/analyticsRepository.js';
import { MongoAttemptRepository } from './mongo/attemptRepository.js';
import { MongoExamRepository } from './mongo/examRepository.js';
import { MongoQuestionRepository } from './mongo/questionRepository.js';
import { MongoUserRepository } from './mongo/userRepository.js';

/**
 * Build isolated repository instances for the given driver.
 * Refuses to instantiate the in-memory driver when running in production.
 */
export const createRepositoryFactory = (
  driver = config.REPOSITORY_DRIVER,
  envOrOptions = config.NODE_ENV,
) => {
  const env = typeof envOrOptions === 'object' && envOrOptions !== null
    ? envOrOptions.nodeEnv ?? config.NODE_ENV
    : envOrOptions;
  if (env === 'production' && driver !== 'mongo') {
    throw new Error(
      'In-memory repository driver is not allowed in production. Set REPOSITORY_DRIVER=mongo.',
    );
  }

  if (driver === 'memory') {
    const userRepo = new MemoryUserRepository();
    const questionRepo = new MemoryQuestionRepository();
    const examRepo = new MemoryExamRepository();
    const attemptRepo = new MemoryAttemptRepository();
    const analyticsRepo = new MemoryAnalyticsRepository({
      attemptRepo,
      examRepo,
      userRepo,
    });
    return {
      driver: 'memory',
      userRepo,
      questionRepo,
      examRepo,
      attemptRepo,
      analyticsRepo,
    };
  }

  if (driver === 'mongo') {
    const userRepo = new MongoUserRepository();
    const questionRepo = new MongoQuestionRepository();
    const examRepo = new MongoExamRepository();
    const attemptRepo = new MongoAttemptRepository();
    const analyticsRepo = new MongoAnalyticsRepository();
    return {
      driver: 'mongo',
      userRepo,
      questionRepo,
      examRepo,
      attemptRepo,
      analyticsRepo,
    };
  }

  throw new Error(`Unsupported REPOSITORY_DRIVER "${driver}". Expected "memory" or "mongo".`);
};
