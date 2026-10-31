import { MemoryAttemptRepository } from './memory/attemptRepository.js';
import { MemoryExamRepository } from './memory/examRepository.js';
import { MemoryQuestionRepository } from './memory/questionRepository.js';
import { MemoryUserRepository } from './memory/userRepository.js';
import { MemoryAnalyticsRepository } from './memory/analyticsRepository.js';

/**
 * Repository factory.
 */
export class RepositoryFactory {
  constructor() {
    this._attempt = new MemoryAttemptRepository();
    this._exam = new MemoryExamRepository();
    this._question = new MemoryQuestionRepository();
    this._user = new MemoryUserRepository();
    this._analytics = new MemoryAnalyticsRepository();
  }

  get attempt() {
    return this._attempt;
  }

  get exam() {
    return this._exam;
  }

  get question() {
    return this._question;
  }

  get user() {
    return this._user;
  }

  get analytics() {
    return this._analytics;
  }
}

/** @type {RepositoryFactory} */
let factory;

/**
 * Get the repository factory instance.
 *
 * @returns {RepositoryFactory}
 */
export function getRepositoryFactory() {
  if (!factory) {
    factory = new RepositoryFactory();
  }
  return factory;
}