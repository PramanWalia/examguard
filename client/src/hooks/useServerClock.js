import { useEffect } from 'react';

import { useClockStore } from '../store/clockStore';

// Returns the server-corrected clock. Components that need to tick should own an
// interval and call now(); this hook intentionally does not re-render the whole page.
export const useServerClock = (serverTime) => {
  const sync = useClockStore((state) => state.sync);
  const now = useClockStore((state) => state.now);
  const offsetMs = useClockStore((state) => state.offsetMs);
  const lastSyncedAt = useClockStore((state) => state.lastSyncedAt);

  useEffect(() => {
    if (serverTime) sync(serverTime);
  }, [serverTime, sync]);

  return { now, offsetMs, lastSyncedAt, sync };
};

export default useServerClock;
