import { useCallback, useEffect, useRef, useState } from 'react';

import apiClient from '../api/client';
import { useAttemptStore } from '../store/attemptStore';
import { getApiError } from '../utils/errors';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const serialize = (answer) =>
  JSON.stringify({
    selectedOptionIds: [...(answer?.selectedOptionIds || [])].sort(),
    numericValue: answer?.numericValue ?? null,
    markedForReview: Boolean(answer?.markedForReview),
  });

const defaultSaveAnswer = async (attemptId, payload) => {
  const response = await apiClient.patch(`/attempts/${attemptId}/answer`, payload);
  return response.data.data;
};

/**
 * Debounced, ordered autosave queue.
 *
 * - clientSeq increases for every network write.
 * - A newer local answer is never deleted by an older response because responses
 *   are not written back into the store.
 * - Network failures retry with exponential backoff; a stale sequence syncs to
 *   the server's sequence and retries, so the client converges.
 */
export const useAutosave = (
  attemptId,
  {
    savedAnswers = [],
    onExpired,
    onServerTime,
    debounceMs = 400,
    maxRetries = 4,
    saveAnswer = defaultSaveAnswer,
  } = {},
) => {
  const answers = useAttemptStore((state) => state.answers);
  const [status, setStatus] = useState('saved');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const queueRef = useRef(new Map());
  const versionRef = useRef(0);
  const seqRef = useRef(0);
  const lastQueuedRef = useRef(new Map());
  const timerRef = useRef(null);
  const processingRef = useRef(false);
  const flushPromiseRef = useRef(null);
  const mountedRef = useRef(true);

  const saveAnswerRef = useRef(saveAnswer);
  const onExpiredRef = useRef(onExpired);
  const onServerTimeRef = useRef(onServerTime);

  useEffect(() => {
    saveAnswerRef.current = saveAnswer;
    onExpiredRef.current = onExpired;
    onServerTimeRef.current = onServerTime;
  }, [saveAnswer, onExpired, onServerTime]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Seed the baseline from the server so hydration does not immediately re-save
  // every restored answer.
  useEffect(() => {
    lastQueuedRef.current = new Map(
      savedAnswers.map((answer) => [answer.itemId, serialize(answer)]),
    );
    // Resume after a reload: the next write must be newer than anything the
    // server already accepted, otherwise it would be rejected as stale.
    const highestSeq = savedAnswers.reduce(
      (highest, answer) => Math.max(highest, Number(answer.clientSeq) || 0),
      0,
    );
    seqRef.current = Math.max(seqRef.current, highestSeq);
  }, [savedAnswers]);

  const updatePending = useCallback(() => {
    if (!mountedRef.current) return;
    setPendingCount(queueRef.current.size);
  }, []);

  const flush = useCallback(async () => {
    if (processingRef.current) return flushPromiseRef.current;
    if (!attemptId) return undefined;

    processingRef.current = true;
    flushPromiseRef.current = (async () => {
      setStatus('saving');
      try {
        while (queueRef.current.size > 0) {
          const [itemId, entry] = queueRef.current.entries().next().value;
          let attempt = 0;

          while (true) {
            try {
              const serverAnswer = await saveAnswerRef.current(attemptId, {
                itemId,
                selectedOptionIds: entry.answer.selectedOptionIds,
                numericValue: entry.answer.numericValue,
                markedForReview: entry.answer.markedForReview,
                clientSeq: (seqRef.current += 1),
              });

              if (serverAnswer?.serverTime) onServerTimeRef.current?.(serverAnswer.serverTime);
              if (queueRef.current.get(itemId)?.version === entry.version) {
                queueRef.current.delete(itemId);
              }
              lastQueuedRef.current.set(itemId, serialize(entry.answer));
              setLastSavedAt(new Date().toISOString());
              updatePending();
              break;
            } catch (error) {
              const apiError = getApiError(error);

              if (apiError.code === 'ATTEMPT_EXPIRED') {
                queueRef.current.clear();
                updatePending();
                onExpiredRef.current?.();
                return;
              }

              if (apiError.code === 'STALE_CLIENT_SEQ') {
                const currentSeq = apiError.details?.[0]?.currentSeq;
                if (Number.isFinite(currentSeq) && attempt < maxRetries) {
                  seqRef.current = Math.max(seqRef.current, currentSeq);
                  attempt += 1;
                  continue;
                }
              }

              attempt += 1;
              if (attempt >= maxRetries) {
                setStatus('error');
                return;
              }

              setStatus('offline');
              await sleep(300 * 2 ** attempt);
            }
          }
        }

        if (mountedRef.current) setStatus('saved');
      } finally {
        processingRef.current = false;
        flushPromiseRef.current = null;
      }
    })();

    return flushPromiseRef.current;
  }, [attemptId, maxRetries, updatePending]);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      flush();
    }, debounceMs);
  }, [debounceMs, flush]);

  useEffect(() => {
    Object.entries(answers).forEach(([itemId, answer]) => {
      const current = serialize(answer);
      if (lastQueuedRef.current.get(itemId) === current) return;

      versionRef.current += 1;
      queueRef.current.set(itemId, { answer: { ...answer }, version: versionRef.current });
      lastQueuedRef.current.set(itemId, current);
    });
    updatePending();
    if (queueRef.current.size > 0) scheduleFlush();
  }, [answers, scheduleFlush, updatePending]);

  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const flushOnOnline = () => {
      if (queueRef.current.size > 0) flush();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('online', flushOnOnline);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('online', flushOnOnline);
    };
  }, [flush]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await flush();
  }, [flush]);

  return { status, pendingCount, lastSavedAt, flushNow };
};

export default useAutosave;
