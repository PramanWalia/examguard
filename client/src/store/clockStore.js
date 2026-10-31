import { create } from 'zustand';

// The server is the clock authority. Every API response that carries serverTime
// updates this offset, and every timer reads now() instead of raw Date.now().
export const useClockStore = create((set, get) => ({
  offsetMs: 0,
  lastSyncedAt: null,

  sync: (serverTime) => {
    if (!serverTime) return;
    const parsed = new Date(serverTime).getTime();
    if (Number.isNaN(parsed)) return;
    set({ offsetMs: parsed - Date.now(), lastSyncedAt: Date.now() });
  },

  now: () => Date.now() + get().offsetMs,

  reset: () => set({ offsetMs: 0, lastSyncedAt: null }),
}));
