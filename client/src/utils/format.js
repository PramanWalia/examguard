const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: true,
});

const timeOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
  hour12: true,
});

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

export const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeOnlyFormatter.format(date);
};

export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateOnlyFormatter.format(date);
};

export const formatDuration = (minutes) => {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins} min`;
};

export const formatSeconds = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const formatClock = (seconds) => {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const formatPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 10) / 10}%` : '—';
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromDateTimeLocal = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const phaseMeta = (phase) =>
  ({
    draft: { label: 'Draft', tone: 'slate' },
    upcoming: { label: 'Upcoming', tone: 'amber' },
    live: { label: 'Live now', tone: 'green' },
    ended: { label: 'Ended', tone: 'slate' },
  })[phase] || { label: phase || 'Unknown', tone: 'slate' };

export const statusMeta = (status) =>
  ({
    not_started: { label: 'Not started', tone: 'slate' },
    in_progress: { label: 'In progress', tone: 'amber' },
    submitted: { label: 'Submitted', tone: 'green' },
    draft: { label: 'Draft', tone: 'slate' },
    published: { label: 'Published', tone: 'brand' },
  })[status] || { label: status || 'Unknown', tone: 'slate' };
