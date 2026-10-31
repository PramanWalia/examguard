import { cn } from '../utils/cn';

export const LoadingState = ({ label = 'Loading', rows = 3 }) => (
  <div aria-busy="true" aria-live="polite" className="page">
    <span className="sr-only">{label}</span>
    <div className="mb-6 space-y-2">
      <div className="skeleton h-3 w-28" />
      <div className="skeleton h-8 w-64 max-w-full" />
      <div className="skeleton h-4 w-96 max-w-full" />
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="skeleton h-24" key={index} />
      ))}
    </div>
    <div className="mt-4 space-y-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton h-32" key={index} />
      ))}
    </div>
  </div>
);

export const EmptyState = ({ icon = '□', title, message, action, className }) => (
  <section
    className={cn(
      'flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50',
      className,
    )}
  >
    <span aria-hidden="true" className="mb-3 text-3xl text-slate-400 dark:text-slate-500">
      {icon}
    </span>
    <h2 className="text-balance text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
    {message && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">{message}</p>}
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </section>
);

export const ErrorState = ({
  title = 'Unable to load this page',
  message = 'We could not load this information. Check your connection and try again.',
  onRetry,
  compact = false,
}) => (
  <section
    className={cn(
      'rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 dark:border-red-900/80 dark:bg-red-950/30 dark:text-red-100',
      compact && 'p-4',
    )}
    role="alert"
  >
    <h2 className="font-bold">{title}</h2>
    <p className="mt-1 text-sm leading-6 opacity-90">{message}</p>
    {onRetry && (
      <button className="btn-secondary btn-sm mt-3 border-red-300 dark:border-red-800" onClick={onRetry} type="button">
        Retry
      </button>
    )}
  </section>
);

export const InlineError = ({ children }) => (
  <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
    {children}
  </p>
);
