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

export { MemoryAnalyticsRepository, MemoryAttemptRepository, MemoryExamRepository, MemoryQuestionRepository, MemoryUserRepository };

/**
 * Build a repository set. Each call returns isolated maps, which is what tests
 * and every app instance rely on.
 *
 * @param {'memory'|'mongo'} [driver]
 * @returns {import('./interfaces.js').RepositoryFactory}
 */
export const createRepositoryFactory = (driver = config.REPOSITORY_DRIVER) => {
  if (driver === 'mongo') {
    const userRepo = new MongoUserRepository();
    const questionRepo = new MongoQuestionRepository();
    const examRepo = new MongoExamRepository();
    const attemptRepo = new MongoAttemptRepository();
    const analyticsRepo = new MongoAnalyticsRepository();
    return { userRepo, questionRepo, examRepo, attemptRepo, analyticsRepo };
  }
  if (driver !== 'memory') throw new Error(`Unsupported REPOSITORY_DRIVER "${driver}".`);

  const userRepo = new MemoryUserRepository();
  const questionRepo = new MemoryQuestionRepository();
  const examRepo = new MemoryExamRepository();
  const attemptRepo = new MemoryAttemptRepository();
  const analyticsRepo = new MemoryAnalyticsRepository({ attemptRepo, examRepo, userRepo });

  return { userRepo, questionRepo, examRepo, attemptRepo, analyticsRepo };
};
