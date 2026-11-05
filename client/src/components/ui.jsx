import { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../utils/cn';
import { initials } from '../utils/format';

export const PageHeader = ({ kicker, title, description, actions, children }) => (
  <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {kicker && <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">{kicker}</p>}
      <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export const Badge = ({ tone = 'slate', children, className }) => (
  <span className={cn(`badge-${tone}`, className)}>{children}</span>
);

export const StatCard = ({ label, value, hint, icon, tone = 'brand' }) => (
  <div className="stat-card">
    <div className="flex items-start justify-between gap-2">
      <p className="stat-label">{label}</p>
      {icon && <span className={`rounded-lg bg-${tone}-50 p-1.5 text-${tone}-700 dark:bg-${tone}-950/50 dark:text-${tone}-300`}>{icon}</span>}
    </div>
    <p className="stat-value">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);

export const Avatar = ({ name, size = 'md' }) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-200',
      size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-xs',
    )}
  >
    {initials(name)}
  </span>
);

export const Field = ({ label, htmlFor, error, hint, required, children, className }) => (
  <div className={className}>
    {label && (
      <label className="label" htmlFor={htmlFor}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    {children}
    {hint && !error && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    {error && <p className="field-error">{error}</p>}
  </div>
);

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input className={cn('input', className)} ref={ref} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select className={cn('select', className)} ref={ref} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea className={cn('textarea', className)} ref={ref} {...props} />;
});

export const Toggle = ({ checked, onChange, label, description, disabled }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
    <span>
      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</span>
      {description && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
    </span>
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  </label>
);

export const Modal = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
  const cardRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const focusable = cardRef.current?.querySelector(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 30);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        cardRef.current?.querySelectorAll(
          'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => !element.disabled && element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      window.clearTimeout(focusTimer);
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      aria-hidden="false"
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn('modal-card', size === 'lg' && 'sm:max-w-4xl', size === 'sm' && 'sm:max-w-md')}
        ref={cardRef}
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white" id={titleId}>{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
          </div>
          <button
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, busy = false }) => (
  <Modal
    footer={
      <>
        <button className="btn-secondary" disabled={busy} onClick={onClose} type="button">Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm} type="button">
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
    onClose={onClose}
    open={open}
    size="sm"
    title={title}
  >
    <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{message}</p>
  </Modal>
);

export const Pagination = ({ meta, onPageChange, label = 'items' }) => {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <div className="mt-5 flex flex-col items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400 sm:flex-row">
      <p>
        Page {meta.page} of {meta.totalPages} · {meta.total} {label}
      </p>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={!meta.hasPreviousPage} onClick={() => onPageChange(meta.page - 1)} type="button">
          Previous
        </button>
        <button className="btn-secondary btn-sm" disabled={!meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)} type="button">
          Next
        </button>
      </div>
    </div>
  );
};

export const Tabs = ({ tabs, value, onChange }) => (
  <div aria-label="View" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900" role="tablist">
    {tabs.map((tab) => (
      <button
        aria-selected={value === tab.value}
        className={cn(
          'flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
          value === tab.value
            ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
            : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
        )}
        key={tab.value}
        onClick={() => onChange(tab.value)}
        role="tab"
        type="button"
      >
        {tab.label}
        {tab.count !== undefined && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-700">{tab.count}</span>}
      </button>
    ))}
  </div>
);

export const Spinner = ({ label = 'Loading' }) => (
  <span className="inline-flex items-center gap-2">
    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <span className="sr-only">{label}</span>
  </span>
);

export const ProgressBar = ({ value, max = 100, label }) => {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

export const CopyButton = ({ value, onCopy, label = 'Copy' }) => (
  <button className="btn-secondary btn-sm" onClick={() => onCopy(value)} type="button">
    {label}
  </button>
);

export const EyeIcon = ({ className = 'h-4 w-4' }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ className = 'h-4 w-4' }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
