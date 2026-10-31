const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const isAnswered = (item) =>
  (item.selectedOptionIds?.length || 0) > 0 || (item.numericValue !== null && item.numericValue !== undefined);

const distributionBands = [
  { label: '0-9', min: 0, max: 9 },
  { label: '10-19', min: 10, max: 19 },
  { label: '20-29', min: 20, max: 29 },
  { label: '30-39', min: 30, max: 39 },
  { label: '40-49', min: 40, max: 49 },
  { label: '50-59', min: 50, max: 59 },
  { label: '60-69', min: 60, max: 69 },
  { label: '70-79', min: 70, max: 79 },
  { label: '80-89', min: 80, max: 89 },
  { label: '90-100', min: 90, max: 100 },
];

/**
 * In-memory analytics. Plain JavaScript aggregation over the other repositories;
 * the Mongo driver will translate the same methods to aggregation pipelines.
 */
export class MemoryAnalyticsRepository {
  constructor({ attemptRepo, examRepo, userRepo }) {
    this._attemptRepo = attemptRepo;
    this._examRepo = examRepo;
    this._userRepo = userRepo;
  }

  async _context(examId) {
    const exam = await this._examRepo.findById(examId);
    const attempts = exam ? await this._attemptRepo.listByExam(examId) : [];
    const submitted = attempts.filter((attempt) => attempt.status === 'submitted' && attempt.gradedPayload);
    const inProgress = attempts.filter((attempt) => attempt.status === 'in_progress');
    const eligible = exam
      ? [...(await this._userRepo.findStudentsInBatches(exam.assignment.batchIds)), ...(await this._userRepo.findUsersWhoJoined(examId))]
          .filter((user) => user.role === 'student' && user.isActive)
      : [];
    const eligibleUnique = [...new Map(eligible.map((user) => [user.id, user])).values()];
    return { exam, attempts, submitted, inProgress, eligible: eligibleUnique };
  }

  async examSummary(examId) {
    const { exam, attempts, submitted, inProgress, eligible } = await this._context(examId);
    if (!exam) return null;

    const totalScore = submitted.reduce((sum, attempt) => sum + attempt.gradedPayload.score, 0);
    const totalPercentage = submitted.reduce((sum, attempt) => sum + attempt.gradedPayload.percentage, 0);
    const totalTime = submitted.reduce((sum, attempt) => sum + (attempt.timeTakenSeconds || 0), 0);
    const itemCount = exam.items.length || 1;

    return {
      examId: exam.id,
      examTitle: exam.title,
      attemptCount: attempts.length,
      submittedCount: submitted.length,
      inProgressCount: inProgress.length,
      notStartedCount: Math.max(0, eligible.length - attempts.length),
      averageScore: submitted.length ? round(totalScore / submitted.length) : 0,
      averagePercentage: submitted.length ? round(totalPercentage / submitted.length) : 0,
      maxScore: exam.totalMarks,
      passCount: submitted.filter((attempt) => attempt.gradedPayload.passed).length,
      failCount: submitted.filter((attempt) => !attempt.gradedPayload.passed).length,
      passPercentage: exam.settings?.passPercentage ?? 40,
      scoreDistribution: await this.scoreDistribution(examId),
      itemStats: await this.questionStats(examId),
      leaderboard: await this.leaderboard(examId),
      averageTimeSeconds: submitted.length ? round(totalTime / submitted.length) : 0,
      averageTimePerQuestionSeconds: submitted.length ? round(totalTime / submitted.length / itemCount) : 0,
    };
  }

  async scoreDistribution(examId) {
    const submitted = await this._attemptRepo.listSubmittedByExam(examId);
    return distributionBands.map((band) => ({
      ...band,
      count: submitted.filter((attempt) => {
        const percentage = attempt.gradedPayload?.percentage ?? 0;
        return percentage >= band.min && percentage <= band.max;
      }).length,
    }));
  }

  async questionStats(examId) {
    const exam = await this._examRepo.findById(examId);
    if (!exam) return [];
    const submitted = await this._attemptRepo.listSubmittedByExam(examId);

    return exam.items
      .map((item) => {
        const graded = submitted
          .map((attempt) => attempt.gradedPayload?.items?.find((entry) => entry.itemId === item.id))
          .filter(Boolean);
        const attempted = graded.filter(isAnswered);
        const correct = attempted.filter((entry) => entry.isCorrect);
        return {
          itemId: item.id,
          order: item.order,
          prompt: item.questionSnapshot?.prompt || '',
          attemptedCount: attempted.length,
          correctCount: correct.length,
          correctPercentage: attempted.length ? round((correct.length / attempted.length) * 100) : 0,
          averageAwardedMarks: attempted.length
            ? round(attempted.reduce((sum, entry) => sum + entry.awardedMarks, 0) / attempted.length)
            : 0,
          averageTimeSeconds: 0,
        };
      })
      .sort((left, right) => left.order - right.order);
  }

  async leaderboard(examId) {
    const submitted = await this._attemptRepo.listSubmittedByExam(examId);
    const users = await this._userRepo.findByIds(submitted.map((attempt) => attempt.studentId));
    const names = new Map(users.map((user) => [user.id, user.name]));
    return [...submitted]
      .sort((left, right) => {
        if (right.gradedPayload.score !== left.gradedPayload.score) {
          return right.gradedPayload.score - left.gradedPayload.score;
        }
        return new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
      })
      .map((attempt, index) => ({
        rank: index + 1,
        studentId: attempt.studentId,
        studentName: names.get(attempt.studentId) || 'Unknown student',
        score: attempt.gradedPayload.score,
        maxScore: attempt.gradedPayload.maxScore,
        percentage: attempt.gradedPayload.percentage,
        submittedAt: attempt.submittedAt,
      }));
  }

  async studentHistory(studentId) {
    const attempts = await this._attemptRepo.listByStudent(studentId);
    const own = attempts.filter(
      (attempt) => attempt.status === 'submitted' && attempt.gradedPayload,
    );
    const exams = await Promise.all(own.map((attempt) => this._examRepo.findById(attempt.examId)));
    const titles = new Map(exams.filter(Boolean).map((exam) => [exam.id, exam.title]));
    return own
      .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())
      .slice(0, 10)
      .map((attempt) => ({
        examId: attempt.examId,
        examTitle: titles.get(attempt.examId) || '',
        percentage: attempt.gradedPayload.percentage,
        submittedAt: attempt.submittedAt,
      }));
  }

  async platformStats() {
    const users = await this._userRepo.platformStats();
    const exams = await this._examRepo.platformStats();
    return { ...users, ...exams };
  }
}
