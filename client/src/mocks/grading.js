const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const sameSet = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
};

export const isAnswerCorrect = (item, answer) => {
  if (!answer) return false;
  if (item.question.type === 'numeric') {
    const value = answer.numericValue;
    if (value === null || value === undefined || value === '') return false;
    const selected = Number(value);
    const correct = Number(item.question.numericAnswer);
    return Number.isFinite(selected) && Number.isFinite(correct) && Math.abs(selected - correct) <= 1e-9;
  }
  return sameSet(answer.selectedOptionIds || [], item.question.correctOptionIds || []);
};

export const isAnswered = (item, answer) => {
  if (!answer) return false;
  if (item.question.type === 'numeric') {
    return answer.numericValue !== null && answer.numericValue !== undefined && answer.numericValue !== '';
  }
  return (answer.selectedOptionIds || []).length > 0;
};

/**
 * Pure grading. No HTTP, no database, no Date.now(), no randomness.
 * Input: immutable question snapshots + the student's answers.
 */
export const gradeAttempt = (questionSet, answers = {}, passPercentage = 40) => {
  const items = questionSet.map((item) => {
    const answer = answers[item.id];
    const answered = isAnswered(item, answer);
    const correct = answered && isAnswerCorrect(item, answer);
    const awardedMarks = !answered
      ? 0
      : correct
        ? item.marks
        : -Math.min(item.negativeMarks || 0, item.marks || 0);

    return {
      itemId: item.id,
      order: item.order,
      prompt: item.question.prompt,
      type: item.question.type,
      options: item.question.options,
      selectedOptionIds: answer?.selectedOptionIds || [],
      numericValue: answer?.numericValue ?? null,
      correctOptionIds: item.question.correctOptionIds,
      numericAnswer: item.question.numericAnswer ?? null,
      awardedMarks: round(awardedMarks),
      isCorrect: correct,
      explanation: item.question.explanation || null,
    };
  });

  const rawScore = items.reduce((sum, item) => sum + item.awardedMarks, 0);
  const maxScore = questionSet.reduce((sum, item) => sum + (Number(item.marks) || 0), 0);
  const score = Math.max(0, round(rawScore));
  const percentage = maxScore > 0 ? round((score / maxScore) * 100) : 0;

  return {
    score,
    maxScore,
    percentage,
    passed: percentage >= Number(passPercentage || 0),
    items,
  };
};
