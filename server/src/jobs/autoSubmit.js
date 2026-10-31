import cron from 'node-cron';

import { gradeAttempt } from '../services/grading.js';

const BATCH_SIZE = 100;

/**
 * Finalize every in-progress attempt whose expiresAt has passed.
 * Per-attempt try/catch so one bad record never stops the sweep.
 */
export const sweepExpiredAttempts = async (repos, now = new Date().toISOString()) => {
  const expired = await repos.attemptRepo.findExpiredInProgress(now, BATCH_SIZE);
  let submitted = 0;

  for (const attempt of expired) {
    try {
      const exam = await repos.examRepo.findById(attempt.examId);
      if (!exam) continue;
      const settings = exam.settings || {};
      const graded = gradeAttempt(attempt.questionSet, attempt.answers, {
        passPercentage: settings.passPercentage ?? 40,
        partialMarking: settings.partialMarking ?? false,
        numericTolerance: settings.numericTolerance ?? 1e-9,
      });
      const updated = await repos.attemptRepo.finalizeIfInProgress(attempt.id, graded, {
        submittedAt: attempt.expiresAt,
        finalizedBy: 'expiry',
      });
      if (updated) submitted += 1;
    } catch (error) {
      console.error(`Auto-submit failed for attempt ${attempt.id}:`, error);
    }
  }

  return submitted;
};

export const startAutoSubmitJob = (repos) =>
  cron.schedule('* * * * *', async () => {
    try {
      const count = await sweepExpiredAttempts(repos);
      if (count > 0) console.log(`Auto-submitted ${count} expired attempt(s).`);
    } catch (error) {
      console.error('Auto-submit sweep failed:', error);
    }
  });
