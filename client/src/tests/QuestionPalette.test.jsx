import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionPalette } from '../pages/AttemptPage';

const questions = [
  { id: 'q1', order: 1, marks: 1, question: { type: 'single_choice', options: [] } },
  { id: 'q2', order: 2, marks: 1, question: { type: 'single_choice', options: [] } },
  { id: 'q3', order: 3, marks: 1, question: { type: 'numeric', options: [] } },
];

describe('QuestionPalette', () => {
  it('labels answered, marked, and current questions for screen readers', () => {
    render(
      <QuestionPalette
        answers={{
          q1: { selectedOptionIds: ['a'], numericValue: null, markedForReview: false },
          q2: { selectedOptionIds: [], numericValue: null, markedForReview: true },
          q3: { selectedOptionIds: [], numericValue: null, markedForReview: false },
        }}
        currentIndex={1}
        onSelect={() => {}}
        questions={questions}
      />,
    );

    expect(screen.getByLabelText('Question 1, answered')).toBeInTheDocument();
    expect(screen.getByLabelText('Question 2, unanswered, marked for review')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('Question 3, unanswered')).toBeInTheDocument();
    expect(screen.getByText('Answered 1')).toBeInTheDocument();
    expect(screen.getByText('Unanswered 2')).toBeInTheDocument();
  });

  it('treats a numeric zero as an answered question', () => {
    render(
      <QuestionPalette
        answers={{ q3: { selectedOptionIds: [], numericValue: 0, markedForReview: false } }}
        currentIndex={2}
        onSelect={() => {}}
        questions={questions}
      />,
    );

    expect(screen.getByLabelText('Question 3, answered')).toBeInTheDocument();
    expect(screen.getByText('Answered 1')).toBeInTheDocument();
  });
});
