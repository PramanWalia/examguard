import {
  getAttemptResume,
  recordViolation,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '../services/examEngine.js';

describe('exam engine public seam', () => {
  it('exports every exam workflow operation', () => {
    expect(typeof startAttempt).toBe('function');
    expect(typeof getAttemptResume).toBe('function');
    expect(typeof saveAnswer).toBe('function');
    expect(typeof recordViolation).toBe('function');
    expect(typeof submitAttempt).toBe('function');
  });
});
