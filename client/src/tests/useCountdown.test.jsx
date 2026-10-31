import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountdown } from '../hooks/useCountdown';
import { useClockStore } from '../store/clockStore';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    useClockStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      useClockStore.getState().reset();
    });
    vi.useRealTimers();
  });

  it('counts down from the server-corrected clock and fires once', () => {
    const onExpire = vi.fn();
    const expiresAt = new Date(Date.now() + 125_000).toISOString();
    const { result } = renderHook(() => useCountdown(expiresAt, { onExpire }));

    expect(result.current.remainingSeconds).toBe(125);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.remainingSeconds).toBe(65);
    expect(result.current.warning).toBe('5 minutes remaining');

    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(result.current.remainingSeconds).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('uses the server offset instead of the device clock', () => {
    // The server is two minutes ahead of this device.
    act(() => {
      useClockStore.getState().sync(new Date(Date.now() + 120_000).toISOString());
    });
    const expiresAt = new Date(Date.now() + 180_000).toISOString();

    const { result } = renderHook(() => useCountdown(expiresAt));

    // 3 minutes of real time minus 2 minutes of server skew.
    expect(result.current.remainingSeconds).toBe(60);
  });
});
