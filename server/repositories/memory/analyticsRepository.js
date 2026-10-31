import { paginate } from '../../utils/pagination.js';

const clone = (value) => structuredClone(value);

/**
 * In-memory analytics repository.
 */
export class MemoryAnalyticsRepository {
  constructor() {
    /** @type {Map<string, import('../interfaces.js').AnalyticsRecord>} */
    this._analytics = new Map();
  }

  async scoreDistribution(examId) {
    const exam = this._analytics.get(examId);
    if (!exam) return null;
    return clone(exam.scoreDistribution);
  }

  async examSummary(examId) {
    const exam = this._analytics.get(examId);
    if (!exam) return null;
    return clone(exam.summary);
  }

  async questionStats(examId) {
    const exam = this._analytics.get(examId);
    if (!exam) return null;
    return clone(exam.questionStats);
  }

  async leaderboard(examId, { page = 1, limit = 10 } = {}) {
    const exam = this._analytics.get(examId);
    if (!exam) return null;
    const { data, meta } = paginate(exam.leaderboard, page, limit);
    return { data: clone(data), meta };
  }

  async studentHistory(studentId, { page = 1, limit = 10 } = {}) {
    const student = Array.from(this._analytics.values()).flatMap((exam) =>
      exam.leaderboard.filter((entry) => entry.studentId === studentId)
    );
    const { data, meta } = paginate(student, page, limit);
    return { data: clone(data), meta };
  }

  async platformStats() {
    const exams = Array.from(this._analytics.values());
    return {
      totalExams: exams.length,
      averageScore: exams.reduce((sum, exam) => sum + exam.summary.averageScore, 0) / exams.length,
      averageTimeTaken: exams.reduce((sum, exam) => sum + exam.summary.averageTimeTaken, 0) / exams.length,
    };
  }

  clear() {
    this._analytics.clear();
  }
}