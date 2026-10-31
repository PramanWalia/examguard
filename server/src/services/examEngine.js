/**
 * Public service seam for the exam engine.
 *
 * Keeping these exports in a focused module makes the most safety-sensitive
 * workflow easy to unit-test and gives a future Mongo implementation one
 * stable entry point without moving HTTP concerns into the engine.
 */
export {
  getAttempt as getAttemptResume,
  recordViolation,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from './examService.js';
