import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutosave } from '../hooks/useAutosave';
import { useAttemptStore } from '../store/attemptStore';

const saved = [
  {
    itemId: 'q1',
    selectedOptionIds: [],
    numericValue: null,
    markedForReview: false,
    clientSeq: 2,
  },
];

describe('useAutosave', () => {
  beforeEach(() => {
    useAttemptStore.getState().reset();
  });

  it('seeds the sequence from saved answers and saves changed answers', async () => {
    const saveAnswer = vi.fn().mockResolvedValue({ serverTime: new Date().toISOString() });
    useAttemptStore.getState().hydrate('attempt-1', saved);

    const { result } = renderHook(() =>
      useAutosave('attempt-1', { savedAnswers: saved, debounceMs: 5, saveAnswer }),
    );

    act(() => {
      useAttemptStore.getState().setAnswer('q1', { selectedOptionIds: ['a'] });
    });

    await waitFor(() => expect(saveAnswer).toHaveBeenCalledTimes(1));
    const [attemptId, payload] = saveAnswer.mock.calls[0];
    expect(attemptId).toBe('attempt-1');
    expect(payload.itemId).toBe('q1');
    expect(payload.selectedOptionIds).toEqual(['a']);
    // Two was already accepted by the server, so the next write must be newer.
    expect(payload.clientSeq).toBe(3);

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.pendingCount).toBe(0);
  });
});
