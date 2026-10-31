import { useState } from 'react';

import { mockControls, mockSnapshot } from './handlers';

const Action = ({ children, onClick, danger = false }) => (
  <button
    className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
      danger
        ? 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40'
        : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
    }`}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const DevToolsPanel = () => {
  const [open, setOpen] = useState(true);
  const [version, setVersion] = useState(0);
  const snapshot = mockSnapshot();

  const run = (action) => {
    action();
    setVersion((value) => value + 1);
  };

  if (!open) {
    return (
      <button
        className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl dark:bg-brand-600"
        onClick={() => setOpen(true)}
        type="button"
      >
        Mock tools
      </button>
    );
  }

  return (
    <aside
      aria-label="Mock server tools"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl"
      key={version}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300">MSW DevTools</p>
          <strong className="text-sm">Stateful mock server</strong>
        </div>
        <button
          aria-label="Close mock tools"
          className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={() => setOpen(false)}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-slate-400">
        <p>
          User: <span className="font-semibold text-slate-200">{snapshot.user?.email || 'signed out'}</span>
        </p>
        <p>
          Attempt: <span className="font-mono text-slate-300">{snapshot.attempt?.id?.slice(-8) || 'none'}</span>
        </p>
        <p className={snapshot.offline ? 'text-red-300' : 'text-emerald-300'}>
          {snapshot.offline ? 'Offline' : 'Online'} · 100–400 ms latency · 2% transient failures
        </p>
        {snapshot.clockOffsetMs !== 0 && (
          <p className="text-amber-300">Server clock skewed +{Math.round(snapshot.clockOffsetMs / 60000)} min</p>
        )}
        {snapshot.failNextSave && <p className="text-amber-300">Next answer save will fail once.</p>}
      </div>

      <div className="mt-3 grid gap-1.5">
        <Action onClick={() => run(mockControls.expireCurrentAttempt)}>
          Make my attempt expire in 20s
        </Action>
        <Action onClick={() => run(mockControls.failNextSave)}>Fail next save</Action>
        <Action onClick={() => run(mockControls.goOffline)}>
          {snapshot.offline ? 'Go back online' : 'Go offline'}
        </Action>
        <Action onClick={() => run(mockControls.skewClock)}>Skew server clock by +2 min</Action>
        <Action
          danger
          onClick={() => {
            mockControls.reset();
            window.location.reload();
          }}
        >
          Reset data
        </Action>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-slate-500">
        Expiry, save failure, offline, and clock skew are intentionally destructive test controls.
        Reload the page to verify attempt resume.
      </p>
    </aside>
  );
};

export default DevToolsPanel;
