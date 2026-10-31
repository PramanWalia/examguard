/**
 * Pure grading. No HTTP, no repositories, no clock, no randomness.
 *
 * `questionSet` is the frozen per-attempt item list: each item has marks,
 * negativeMarks and a full question snapshot (type, correctOptionIds,
 * numericAnswer, options, prompt, explanation).
 *
 * Multiple-choice partial marking (only when the exam enables it):
 *   awarded = marks * (correctPicks - wrongPicks) / correctCount, clamped to [0, marks]
 * Partial marking replaces the negative-mark penalty for that item.
 */

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const sameSet = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

export const isAnswered = (item, answer) => {
  if (!answer) return false;
  if (item.question.type === 'numeric') {
    return answer.numericValue !== null && answer.numericValue !== undefined && answer.numericValue !== '';
  }
  return (answer.selectedOptionIds || []).length > 0;
};

export const isAnswerCorrect = (item, answer, tolerance = 1e-9) => {
  if (!isAnswered(item, answer)) return false;
  if (item.question.type === 'numeric') {
    const selected = Number(answer.numericValue);
    const correct = Number(item.question.numericAnswer);
    return Number.isFinite(selected) && Number.isFinite(correct) && Math.abs(selected - correct) <= tolerance;
  }
  return sameSet(answer.selectedOptionIds || [], item.question.correctOptionIds || []);
};

const partialChoiceMarks = (item, answer) => {
  const correctIds = item.question.correctOptionIds || [];
  const selectedIds = answer.selectedOptionIds || [];
  if (!correctIds.length) return 0;
  const correct = new Set(correctIds);
  const correctPicks = selectedIds.filter((id) => correct.has(id)).length;
  const wrongPicks = selectedIds.length - correctPicks;
  return Math.max(0, Math.min(Number(item.marks) || 0, ((Number(item.marks) || 0) * (correctPicks - wrongPicks)) / correctIds.length));
};

/**
 * @param {Array<Object>} questionSet
 * @param {Object<string, Object>} answers keyed by item id
 * @param {{passPercentage?: number, partialMarking?: boolean, numericTolerance?: number}} [options]
 */
export const gradeAttempt = (questionSet, answers = {}, { passPercentage = 40, partialMarking = false, numericTolerance = 1e-9 } = {}) => {
  const items = questionSet.map((item) => {
    const answer = answers[item.id];
    const answered = isAnswered(item, answer);
    const correct = answered && isAnswerCorrect(item, answer, numericTolerance);
    const marks = Number(item.marks) || 0;

    let awardedMarks = 0;
    if (answered) {
      if (correct) {
        awardedMarks = marks;
      } else if (partialMarking && item.question.type === 'multiple_choice') {
        awardedMarks = partialChoiceMarks(item, answer);
      } else {
        awardedMarks = -Math.min(Number(item.negativeMarks) || 0, marks);
      }
    }

    return {
      itemId: item.id,
      order: item.order,
      prompt: item.question.prompt,
      type: item.question.type,
      options: item.question.options || [],
      selectedOptionIds: [...(answer?.selectedOptionIds || [])],
      numericValue: answer?.numericValue ?? null,
      correctOptionIds: [...(item.question.correctOptionIds || [])],
      numericAnswer: item.question.numericAnswer ?? null,
      awardedMarks: round(awardedMarks),
      isCorrect: correct,
      explanation: item.question.explanation || null,
    };
  });

  const maxScore = round(questionSet.reduce((sum, item) => sum + (Number(item.marks) || 0), 0));
  const score = Math.max(0, round(items.reduce((sum, item) => sum + item.awardedMarks, 0)));
  const percentage = maxScore > 0 ? round((score / maxScore) * 100) : 0;

  return {
    score,
    maxScore,
    percentage,
    passed: percentage >= Number(passPercentage || 0),
    items,
  };
};
