import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '../api/client';
import { AttemptPage } from '../pages/AttemptPage';
import { useAttemptStore } from '../store/attemptStore';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  unwrap: (response) => response?.data?.data ?? response?.data,
}));

const activeAttemptPayload = {
  attemptId: 'attempt-501',
  examId: 'exam-501',
  exam: {
    id: 'exam-501',
    title: 'Algorithms Midterm',
    durationMinutes: 30,
    totalMarks: 5,
  },
  status: 'in_progress',
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  serverTime: new Date().toISOString(),
  durationMinutes: 30,
  violationCount: 0,
  maxViolations: 3,
  autoSubmitOnViolation: true,
  resultMode: 'immediate',
  resultAvailable: false,
  questions: [
    {
      id: 'item-1',
      order: 1,
      marks: 2,
      negativeMarks: 0.5,
      question: {
        subject: 'Computer Science',
        topic: 'Sorting',
        difficulty: 'easy',
        type: 'single_choice',
        prompt: 'What is the worst-case time complexity of Merge Sort?',
        options: [
          { id: 'a', text: 'O(n log n)' },
          { id: 'b', text: 'O(n^2)' },
        ],
      },
    },
    {
      id: 'item-2',
      order: 2,
      marks: 3,
      negativeMarks: 0,
      question: {
        subject: 'Computer Science',
        topic: 'Trees',
        difficulty: 'medium',
        type: 'numeric',
        prompt: 'How many edges does a tree with 10 vertices have?',
        options: [],
      },
    },
  ],
  savedAnswers: [],
};

const renderAttemptPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/student/attempts/attempt-501']}>
        <Routes>
          <Route path="/student/attempts/:attemptId" element={<AttemptPage />} />
          <Route path="/student/results/:attemptId" element={<div>Result Detail View</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AttemptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAttemptStore.getState().reset();
    apiClient.get.mockResolvedValue({ data: { data: activeAttemptPayload } });
    apiClient.patch.mockResolvedValue({
      data: { data: { serverTime: new Date().toISOString(), clientSeq: 1 } },
    });
    apiClient.post.mockResolvedValue({
      data: {
        data: {
          attemptId: 'attempt-501',
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          resultAvailable: true,
        },
      },
    });
  });

  it('renders the active attempt, records option selection and review marks, and submits via confirmation dialog', async () => {
    renderAttemptPage();

    expect(await screen.findByText('What is the worst-case time complexity of Merge Sort?')).toBeInTheDocument();
    expect(screen.getByText('Algorithms Midterm')).toBeInTheDocument();

    // Select option A on question 1
    fireEvent.click(screen.getByText('O(n log n)'));
    await waitFor(() => {
      expect(useAttemptStore.getState().answers['item-1']?.selectedOptionIds).toEqual(['a']);
    });

    // Mark question 1 for review
    fireEvent.click(screen.getByRole('button', { name: /Mark for review/i }));
    expect(useAttemptStore.getState().answers['item-1']?.markedForReview).toBe(true);

    // Navigate to question 2
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(await screen.findByText('How many edges does a tree with 10 vertices have?')).toBeInTheDocument();

    // Open submit modal and confirm submission
    fireEvent.click(screen.getAllByRole('button', { name: /Review & submit/i })[0]);
    expect(await screen.findByRole('dialog', { name: /Submit this attempt\?/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Submit attempt$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/attempts/attempt-501/submit');
    });
  });
});
