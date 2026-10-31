import { gradeAttempt, isAnswerCorrect, isAnswered } from '../services/grading.js';

const options = [
  { id: 'a', text: 'A' },
  { id: 'b', text: 'B' },
  { id: 'c', text: 'C' },
];

const item = ({ type = 'single_choice', marks = 2, negativeMarks = 0, correct = ['a'], numeric = null, id = 'i1' } = {}) => ({
  id,
  order: 1,
  marks,
  negativeMarks,
  question: {
    type,
    prompt: 'Question?',
    options: type === 'numeric' ? [] : options,
    correctOptionIds: type === 'numeric' ? [] : correct,
    numericAnswer: numeric,
    explanation: 'Because.',
  },
});

const gradeOne = (examItem, answer, optionsOverride = {}) =>
  gradeAttempt([examItem], answer ? { i1: answer } : {}, optionsOverride);

describe('isAnswered', () => {
  it('treats an empty selection as unanswered', () => {
    expect(isAnswered(item(), { selectedOptionIds: [] })).toBe(false);
  });

  it('accepts a selected option', () => {
    expect(isAnswered(item(), { selectedOptionIds: ['a'] })).toBe(true);
  });

  it('accepts numeric zero as an answer', () => {
    expect(isAnswered(item({ type: 'numeric', numeric: 0 }), { numericValue: 0 })).toBe(true);
  });
});

describe('isAnswerCorrect', () => {
  it('ignores option order', () => {
    expect(
      isAnswerCorrect(item({ type: 'multiple_choice', correct: ['a', 'b'] }), { selectedOptionIds: ['b', 'a'] }),
    ).toBe(true);
  });

  it('rejects a missing option', () => {
    expect(
      isAnswerCorrect(item({ type: 'multiple_choice', correct: ['a', 'b'] }), { selectedOptionIds: ['a'] }),
    ).toBe(false);
  });

  it('rejects an extra option', () => {
    expect(
      isAnswerCorrect(item({ type: 'multiple_choice', correct: ['a', 'b'] }), { selectedOptionIds: ['a', 'b', 'c'] }),
    ).toBe(false);
  });

  it('compares numerics with tolerance', () => {
    expect(isAnswerCorrect(item({ type: 'numeric', numeric: 25 }), { numericValue: 25.0000000001 })).toBe(true);
  });

  it('rejects numerics outside tolerance', () => {
    expect(isAnswerCorrect(item({ type: 'numeric', numeric: 25 }), { numericValue: 25.01 })).toBe(false);
  });

  it('rejects non-finite numerics', () => {
    expect(isAnswerCorrect(item({ type: 'numeric', numeric: 25 }), { numericValue: Number.NaN })).toBe(false);
  });
});

describe('gradeAttempt', () => {
  it('awards full marks for a correct single choice', () => {
    const result = gradeOne(item(), { selectedOptionIds: ['a'] });
    expect(result.score).toBe(2);
    expect(result.items[0].isCorrect).toBe(true);
  });

  it('awards zero for an unanswered item', () => {
    const result = gradeOne(item(), null);
    expect(result.score).toBe(0);
    expect(result.items[0].isCorrect).toBe(false);
  });

  it('subtracts negative marks for a wrong single choice', () => {
    const result = gradeOne(item({ negativeMarks: 0.5 }), { selectedOptionIds: ['b'] });
    expect(result.items[0].awardedMarks).toBe(-0.5);
  });

  it('never awards a negative item score below -marks', () => {
    const result = gradeOne(item({ marks: 2, negativeMarks: 100 }), { selectedOptionIds: ['b'] });
    expect(result.items[0].awardedMarks).toBe(-2);
  });

  it('clamps the total score at zero', () => {
    const result = gradeAttempt(
      [item({ marks: 1, negativeMarks: 1 }), item({ marks: 1, negativeMarks: 1 })],
      { i1: { selectedOptionIds: ['b'] }, i2: { selectedOptionIds: ['b'] } },
    );
    expect(result.score).toBe(0);
  });

  it('awards full marks for an exact multiple-choice match', () => {
    const result = gradeOne(item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4 }), {
      selectedOptionIds: ['b', 'a'],
    });
    expect(result.score).toBe(4);
  });

  it('all-or-nothing multiple choice loses full marks', () => {
    const result = gradeOne(item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4 }), {
      selectedOptionIds: ['a'],
    });
    expect(result.items[0].awardedMarks).toBe(0);
  });

  it('all-or-nothing multiple choice applies negative marks', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4, negativeMarks: 1 }),
      { selectedOptionIds: ['a'] },
    );
    expect(result.items[0].awardedMarks).toBe(-1);
  });

  it('partial marking awards a proportion of marks', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4 }),
      { selectedOptionIds: ['a'] },
      { partialMarking: true },
    );
    expect(result.items[0].awardedMarks).toBe(2);
  });

  it('partial marking subtracts wrong picks', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b', 'c'], marks: 6 }),
      { selectedOptionIds: ['a', 'a2'] },
      { partialMarking: true },
    );
    expect(result.items[0].awardedMarks).toBe(0);
  });

  it('partial marking never goes negative', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4, negativeMarks: 2 }),
      { selectedOptionIds: ['c'] },
      { partialMarking: true },
    );
    expect(result.items[0].awardedMarks).toBe(0);
  });

  it('partial marking still gives full marks for an exact match', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b'], marks: 4 }),
      { selectedOptionIds: ['a', 'b'] },
      { partialMarking: true },
    );
    expect(result.items[0].awardedMarks).toBe(4);
  });

  it('partial marking with one of three correct awards a third', () => {
    const result = gradeOne(
      item({ type: 'multiple_choice', correct: ['a', 'b', 'c'], marks: 3 }),
      { selectedOptionIds: ['a'] },
      { partialMarking: true },
    );
    expect(result.items[0].awardedMarks).toBe(1);
  });

  it('awards numeric marks on an exact match', () => {
    const result = gradeOne(item({ type: 'numeric', numeric: 25, marks: 3 }), { numericValue: 25 });
    expect(result.score).toBe(3);
  });

  it('awards numeric marks inside tolerance', () => {
    const result = gradeOne(item({ type: 'numeric', numeric: 1, marks: 2 }), { numericValue: 1.005 }, {
      numericTolerance: 0.01,
    });
    expect(result.score).toBe(2);
  });

  it('rejects numeric answers outside tolerance', () => {
    const result = gradeOne(item({ type: 'numeric', numeric: 1, marks: 2 }), { numericValue: 1.02 }, {
      numericTolerance: 0.01,
    });
    expect(result.items[0].isCorrect).toBe(false);
  });

  it('treats null numeric as unanswered', () => {
    const result = gradeOne(item({ type: 'numeric', numeric: 5, marks: 2 }), { numericValue: null });
    expect(result.items[0].awardedMarks).toBe(0);
  });

  it('sums maxScore from item marks', () => {
    const result = gradeAttempt([item({ marks: 2 }), item({ marks: 3 })], {});
    expect(result.maxScore).toBe(5);
  });

  it('handles a zero-mark item', () => {
    const result = gradeOne(item({ marks: 0, negativeMarks: 0 }), { selectedOptionIds: ['a'] });
    expect(result.score).toBe(0);
    expect(result.items[0].isCorrect).toBe(true);
  });

  it('computes rounded percentage', () => {
    const result = gradeAttempt([item({ marks: 1 }), item({ marks: 2, id: 'i2' })], {
      i1: { selectedOptionIds: ['a'] },
    });
    expect(result.percentage).toBe(33.33);
  });

  it('passes exactly at the threshold', () => {
    const result = gradeOne(item({ marks: 2 }), { selectedOptionIds: ['a'] }, { passPercentage: 100 });
    expect(result.passed).toBe(true);
  });

  it('fails below the threshold', () => {
    const result = gradeOne(item({ marks: 2 }), { selectedOptionIds: ['b'] }, { passPercentage: 40 });
    expect(result.passed).toBe(false);
  });

  it('returns answer keys and the explanation in the graded item', () => {
    const result = gradeOne(item({ type: 'multiple_choice', correct: ['a', 'b'] }), { selectedOptionIds: ['a'] });
    expect(result.items[0].correctOptionIds).toEqual(['a', 'b']);
    expect(result.items[0].explanation).toBe('Because.');
  });

  it('keeps the selected answer in the graded item', () => {
    const result = gradeOne(item(), { selectedOptionIds: ['b'], numericValue: null });
    expect(result.items[0].selectedOptionIds).toEqual(['b']);
  });

  it('handles an empty question set', () => {
    const result = gradeAttempt([], {});
    expect(result).toMatchObject({ score: 0, maxScore: 0, percentage: 0 });
  });
});
