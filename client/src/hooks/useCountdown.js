import { useEffect, useRef, useState } from 'react';

import { useServerClock } from './useServerClock';

const computeRemaining = (targetMs, nowMs) => Math.max(0, Math.ceil((targetMs - nowMs) / 1000));

/**
 * Countdown derived from the server-corrected clock.
 *
 * The hook returns the remaining seconds and a coarse warning label. The warning
 * changes only at the configured thresholds, so an aria-live region does not
 * announce every tick.
 */
export const useCountdown = (
  expiresAt,
  { onExpire, warnings = [300, 60], enabled = true } = {},
) => {
  const { now } = useServerClock();
  const targetMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Number.isNaN(targetMs) ? 0 : computeRemaining(targetMs, now()),
  );
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!enabled || Number.isNaN(targetMs)) return undefined;

    firedRef.current = false;
    const tick = () => {
      const remaining = computeRemaining(targetMs, now());
      setRemainingSeconds(remaining);
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, targetMs, now]);

  const warning = (() => {
    if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return null;
    const sorted = [...warnings].sort((a, b) => a - b);
    if (remainingSeconds <= (sorted[0] ?? 60)) return '1 minute remaining';
    if (remainingSeconds <= (sorted[1] ?? 300)) return '5 minutes remaining';
    return null;
  })();

  return { remainingSeconds, warning };
};

export default useCountdown;
