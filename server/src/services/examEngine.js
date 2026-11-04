/**
 * Public service seam for the exam engine.
 */
export {
  evaluateServerProctoringSignals,
  getAttempt as getAttemptResume,
  recordHeartbeat,
  recordViolation,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from './examService.js';
