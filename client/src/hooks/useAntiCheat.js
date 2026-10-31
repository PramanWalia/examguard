import { useCallback, useEffect, useRef, useState } from 'react';

import apiClient from '../api/client';
import { getApiError } from '../utils/errors';
import { VIOLATION_TYPES } from '../utils/constants';

const EVENT_DEBOUNCE_MS = 900;

/**
 * Best-effort exam proctoring. This is a deterrent, not a security boundary:
 * a determined student can disable JavaScript or use another device. The server
 * still owns the attempt, expiry, and submission.
 */
export const useAntiCheat = (
  attemptId,
  {
    initialCount = 0,
    maxViolations = 0,
    autoSubmit = false,
    onAutoSubmit,
    onExpired,
    enabled = true,
  } = {},
) => {
  const [violationCount, setViolationCount] = useState(initialCount);
  const [warning, setWarning] = useState(null);
  const [fullscreenActive, setFullscreenActive] = useState(
    () => Boolean(document.fullscreenElement),
  );

  const questionAreaRef = useRef(null);
  const lastEventAtRef = useRef(0);
  const attemptIdRef = useRef(attemptId);
  const configRef = useRef({ maxViolations, autoSubmit, onAutoSubmit, onExpired });
  const mountedRef = useRef(true);

  useEffect(() => {
    attemptIdRef.current = attemptId;
    configRef.current = { maxViolations, autoSubmit, onAutoSubmit, onExpired };
  }, [attemptId, maxViolations, autoSubmit, onAutoSubmit, onExpired]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const record = useCallback(
    async (type, meta = {}) => {
      if (!enabled || !attemptIdRef.current) return;

      const now = Date.now();
      // Blur and visibilitychange often fire together for one tab switch.
      if (now - lastEventAtRef.current < EVENT_DEBOUNCE_MS) return;
      lastEventAtRef.current = now;

      setViolationCount((count) => {
        const optimistic = count + 1;
        setWarning({
          type,
          count: optimistic,
          max: configRef.current.maxViolations,
          autoSubmitted: false,
          pending: true,
        });
        return optimistic;
      });

      try {
        const response = await apiClient.post(`/attempts/${attemptIdRef.current}/violation`, {
          type,
          meta,
        });
        const data = response.data.data;
        if (!mountedRef.current) return;
        setViolationCount(data.violationCount);
        setWarning({
          type,
          count: data.violationCount,
          max: data.maxViolations ?? configRef.current.maxViolations,
          autoSubmitted: Boolean(data.autoSubmitted),
          pending: false,
        });
        if (data.autoSubmitted) configRef.current.onAutoSubmit?.(data);
      } catch (error) {
        const apiError = getApiError(error);
        if (apiError.code === 'ATTEMPT_EXPIRED') configRef.current.onExpired?.();
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') record(VIOLATION_TYPES.TAB_HIDDEN);
    };
    const onWindowBlur = () => record(VIOLATION_TYPES.WINDOW_BLUR);
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);
      if (!active) record(VIOLATION_TYPES.FULLSCREEN_EXIT);
    };
    const onKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      const blocked =
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (event.ctrlKey && key === 'u');
      if (blocked) {
        event.preventDefault();
        record(VIOLATION_TYPES.SHORTCUT, { key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey });
      }
    };

    const areaContains = (target) =>
      questionAreaRef.current ? questionAreaRef.current.contains(target) : true;
    const blockEvent = (type) => (event) => {
      if (!areaContains(event.target)) return;
      event.preventDefault();
      record(type);
    };

    const onContextMenu = blockEvent(VIOLATION_TYPES.CONTEXT_MENU);
    const onCopy = blockEvent(VIOLATION_TYPES.COPY);
    const onCut = blockEvent(VIOLATION_TYPES.COPY);
    const onPaste = blockEvent(VIOLATION_TYPES.PASTE);
    const onSelectStart = (event) => {
      if (areaContains(event.target)) event.preventDefault();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('selectstart', onSelectStart);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('selectstart', onSelectStart);
    };
  }, [enabled, record]);

  const requestFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) return true;
      if (!document.documentElement.requestFullscreen) return false;
      await document.documentElement.requestFullscreen();
      setFullscreenActive(true);
      return true;
    } catch {
      // Browsers require a user gesture; the UI keeps a visible "Enter fullscreen" button.
      return false;
    }
  }, []);

  const dismissWarning = useCallback(() => setWarning(null), []);

  return {
    violationCount,
    warning,
    fullscreenActive,
    fullscreenSupported: Boolean(document.documentElement.requestFullscreen),
    questionAreaRef,
    requestFullscreen,
    dismissWarning,
    record,
  };
};

export default useAntiCheat;
