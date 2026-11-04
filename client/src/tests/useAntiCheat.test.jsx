import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '../api/client';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { VIOLATION_TYPES } from '../utils/constants';

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('useAntiCheat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a window_blur violation, updates count and warning, and deduplicates rapid repeat events', async () => {
    apiClient.post.mockResolvedValue({
      data: {
        data: {
          violationCount: 1,
          maxViolations: 3,
          autoSubmitted: false,
        },
      },
    });

    const { result } = renderHook(() =>
      useAntiCheat('attempt-101', { initialCount: 0, maxViolations: 3, enabled: true }),
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
      // Rapid second event within 900ms debounce should be ignored.
      window.dispatchEvent(new Event('blur'));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(apiClient.post).toHaveBeenCalledWith('/attempts/attempt-101/violation', {
      type: VIOLATION_TYPES.WINDOW_BLUR,
      meta: {},
    });

    await waitFor(() => expect(result.current.violationCount).toBe(1));
    expect(result.current.warning).toMatchObject({
      type: VIOLATION_TYPES.WINDOW_BLUR,
      count: 1,
      max: 3,
      autoSubmitted: false,
      pending: false,
    });

    act(() => {
      result.current.dismissWarning();
    });
    expect(result.current.warning).toBeNull();
  });

  it('triggers onAutoSubmit when the server reports autoSubmitted: true', async () => {
    const onAutoSubmit = vi.fn();
    apiClient.post.mockResolvedValue({
      data: {
        data: {
          violationCount: 3,
          maxViolations: 3,
          autoSubmitted: true,
        },
      },
    });

    const { result } = renderHook(() =>
      useAntiCheat('attempt-202', {
        initialCount: 2,
        maxViolations: 3,
        autoSubmit: true,
        onAutoSubmit,
        enabled: true,
      }),
    );

    await act(async () => {
      await result.current.record(VIOLATION_TYPES.TAB_HIDDEN);
    });

    expect(onAutoSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        violationCount: 3,
        autoSubmitted: true,
      }),
    );
  });

  it('blocks F12 developer shortcut and records a shortcut violation', async () => {
    apiClient.post.mockResolvedValue({
      data: {
        data: {
          violationCount: 1,
          maxViolations: 3,
          autoSubmitted: false,
        },
      },
    });

    renderHook(() => useAntiCheat('attempt-303', { initialCount: 0, maxViolations: 3, enabled: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'F12', cancelable: true });
      document.dispatchEvent(event);
    });

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/attempts/attempt-303/violation', {
        type: VIOLATION_TYPES.SHORTCUT,
        meta: { key: 'F12', ctrl: false, shift: false },
      }),
    );
  });
});
