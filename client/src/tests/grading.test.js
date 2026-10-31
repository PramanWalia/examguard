import { describe, expect, it } from 'vitest';

import { gradeAttempt } from '../mocks/grading';

const question = (overrides) => ({
  id: 'item-1',
  order: 1,
  marks: 2,
  negativeMarks: 0.5,
  question: {
    type: 'single_choice',
    prompt: 'Pick one',
    options: [
      { id: 'a', text: 'Right' },
      { id: 'b', text: 'Wrong' },
    ],
    correctOptionIds: ['a'],
    numericAnswer: null,
    explanation: 'Because a.',
    ...overrides,
  },
});

describe('gradeAttempt', () => {
  it('awards full marks for the exact option set', () => {
    const result = gradeAttempt([question()], {
      'item-1': { selectedOptionIds: ['a'], numericValue: null, markedForReview: false },
    });
    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(2);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.items[0].isCorrect).toBe(true);
  });

  it('applies negative marks and never returns a negative total', () => {
    const result = gradeAttempt([question()], {
      'item-1': { selectedOptionIds: ['b'], numericValue: null, markedForReview: false },
    });
    expect(result.score).toBe(0);
    expect(result.items[0].awardedMarks).toBe(-0.5);
  });

  it('grades numeric answers exactly', () => {
    const numeric = question({
      type: 'numeric',
      options: [],
      correctOptionIds: [],
      numericAnswer: 42,
    });
    const correct = gradeAttempt([numeric], {
      'item-1': { selectedOptionIds: [], numericValue: 42, markedForReview: false },
    });
    const wrong = gradeAttempt([numeric], {
      'item-1': { selectedOptionIds: [], numericValue: 41, markedForReview: false },
    });
    expect(correct.score).toBe(2);
    expect(wrong.score).toBe(0);
  });
});
