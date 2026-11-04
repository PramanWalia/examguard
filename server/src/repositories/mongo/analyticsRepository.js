import { AttemptModel } from '../../models/attempt.js';
import { ExamModel } from '../../models/exam.js';
import { UserModel } from '../../models/user.js';

const bands = Array.from({ length: 10 }, (_, index) => ({
  label: index === 9 ? '90-100' : `${index * 10}-${index * 10 + 9}`,
  min: index * 10,
  max: index === 9 ? 100 : index * 10 + 9,
}));

const findSubmittedAttempts = (examId) =>
  AttemptModel.find({
    examId,
    status: 'submitted',
    gradedPayload: { $ne: null },
  }).lean();

const isAnswered = (item) =>
  (item.selectedOptionIds?.length || 0) > 0 ||
  (item.numericValue !== null && item.numericValue !== undefined);

const round2 = (value) => Math.round(Number(value) * 100) / 100;

export class MongoAnalyticsRepository {
  async scoreDistribution(examId) {
    const rows = await findSubmittedAttempts(examId);
    return bands.map((band) => ({
      ...band,
      count: rows.filter((attempt) => {
        const percentage = attempt.gradedPayload?.percentage || 0;
        return percentage >= band.min && percentage <= band.max;
      }).length,
    }));
  }

  async leaderboard(examId) {
    const rows = await findSubmittedAttempts(examId);
    const studentIds = rows.map((attempt) => attempt.studentId);
    const users = await UserModel.find({ _id: { $in: studentIds } })
      .select('name')
      .lean();
    const names = new Map(users.map((user) => [String(user._id), user.name]));

    return [...rows]
      .sort((left, right) => {
        if (right.gradedPayload.score !== left.gradedPayload.score) {
          return right.gradedPayload.score - left.gradedPayload.score;
        }
        return new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
      })
      .map((attempt, index) => ({
        rank: index + 1,
        studentId: String(attempt.studentId),
        studentName: names.get(String(attempt.studentId)) || 'Unknown student',
        score: attempt.gradedPayload.score,
        maxScore: attempt.gradedPayload.maxScore,
        percentage: attempt.gradedPayload.percentage,
        submittedAt:
          attempt.submittedAt instanceof Date
            ? attempt.submittedAt.toISOString()
            : attempt.submittedAt,
      }));
  }

  async questionStats(examId) {
    const [exam, rows] = await Promise.all([
      ExamModel.findById(examId).lean(),
      findSubmittedAttempts(examId),
    ]);
    if (!exam) return [];

    return (exam.items || [])
      .map((item) => {
        const graded = rows.flatMap((attempt) =>
          (attempt.gradedPayload?.items || []).filter((entry) => entry.itemId === item.id),
        );
        const attempted = graded.filter(isAnswered);
        const correct = attempted.filter((entry) => entry.isCorrect);

        return {
          itemId: item.id,
          order: item.order,
          prompt: item.questionSnapshot?.prompt || '',
          attemptedCount: attempted.length,
          correctCount: correct.length,
          correctPercentage: attempted.length
            ? round2((correct.length / attempted.length) * 100)
            : 0,
          averageAwardedMarks: attempted.length
            ? round2(
                attempted.reduce((sum, entry) => sum + entry.awardedMarks, 0) / attempted.length,
              )
            : 0,
          averageTimeSeconds: 0,
        };
      })
      .sort((left, right) => left.order - right.order);
  }

  async examSummary(examId) {
    const exam = await ExamModel.findById(examId).lean();
    if (!exam) return null;

    const allAttempts = await AttemptModel.find({ examId }).lean();
    const submitted = allAttempts.filter(
      (attempt) => attempt.status === 'submitted' && attempt.gradedPayload,
    );
    const inProgress = allAttempts.filter((attempt) => attempt.status === 'in_progress');

    const eligibleCount = await UserModel.countDocuments({
      role: 'student',
      isActive: true,
      $or: [
        { batchIds: { $in: exam.assignment?.batchIds || [] } },
        { joinedExamIds: examId },
      ],
    });

    const averageScore = submitted.length
      ? submitted.reduce((sum, attempt) => sum + attempt.gradedPayload.score, 0) /
        submitted.length
      : 0;
    const averagePercentage = submitted.length
      ? submitted.reduce((sum, attempt) => sum + attempt.gradedPayload.percentage, 0) /
        submitted.length
      : 0;
    const totalTime = submitted.reduce(
      (sum, attempt) => sum + (attempt.timeTakenSeconds || 0),
      0,
    );
    const settings = exam.settings || {};
    const itemCount = exam.items?.length || 1;

    const [scoreDistribution, itemStats, leaderboard] = await Promise.all([
      this.scoreDistribution(examId),
      this.questionStats(examId),
      this.leaderboard(examId),
    ]);

    return {
      examId: String(exam._id),
      examTitle: exam.title,
      attemptCount: allAttempts.length,
      submittedCount: submitted.length,
      inProgressCount: inProgress.length,
      notStartedCount: Math.max(0, eligibleCount - allAttempts.length),
      averageScore: round2(averageScore),
      averagePercentage: round2(averagePercentage),
      maxScore: exam.totalMarks,
      passCount: submitted.filter((attempt) => attempt.gradedPayload.passed).length,
      failCount: submitted.filter((attempt) => !attempt.gradedPayload.passed).length,
      passPercentage: settings.passPercentage ?? 40,
      scoreDistribution,
      itemStats,
      leaderboard,
      averageTimeSeconds: submitted.length ? round2(totalTime / submitted.length) : 0,
      averageTimePerQuestionSeconds: submitted.length
        ? round2(totalTime / submitted.length / itemCount)
        : 0,
    };
  }

  async studentHistory(studentId) {
    const rows = await AttemptModel.find({
      studentId,
      status: 'submitted',
    })
      .sort({ submittedAt: -1 })
      .limit(10)
      .lean();

    const examIds = [...new Set(rows.map((row) => row.examId))];
    const exams = await ExamModel.find({ _id: { $in: examIds } })
      .select('title')
      .lean();
    const titles = new Map(exams.map((exam) => [String(exam._id), exam.title]));

    return rows.map((row) => ({
      examId: String(row.examId),
      examTitle: titles.get(String(row.examId)) || '',
      percentage: row.gradedPayload?.percentage || 0,
      submittedAt:
        row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
    }));
  }

  async platformStats() {
    const [users, activeUsers, roleCounts, exams] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ isActive: true }),
      UserModel.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      ExamModel.find({}).select('status startAt endAt').lean(),
    ]);

    const counts = Object.fromEntries(roleCounts.map((row) => [row._id, row.count]));
    const now = new Date();

    return {
      totalUsers: users,
      activeUsers,
      roleCounts: {
        admin: counts.admin || 0,
        teacher: counts.teacher || 0,
        student: counts.student || 0,
      },
      totalExams: exams.length,
      publishedExams: exams.filter((exam) => exam.status === 'published').length,
      draftExams: exams.filter((exam) => exam.status === 'draft').length,
      liveExams: exams.filter(
        (exam) => exam.status === 'published' && exam.startAt <= now && exam.endAt >= now,
      ).length,
    };
  }
}
