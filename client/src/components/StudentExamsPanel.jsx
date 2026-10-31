import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useCountdown } from '../hooks/useCountdown';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatDuration, formatSeconds } from '../utils/format';
import { EmptyState, ErrorState, InlineError } from './States';
import { Badge, Modal, PageHeader } from './ui';

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

const availabilityBadge = (exam) => {
  if (exam.attemptStatus === 'submitted') return { tone: 'green', label: 'Submitted' };
  if (exam.canResume) return { tone: 'amber', label: 'In progress' };
  if (exam.availability === 'live') return { tone: 'green', label: 'Live now' };
  if (exam.availability === 'upcoming') return { tone: 'amber', label: 'Upcoming' };
  if (exam.availability === 'ended') return { tone: 'slate', label: 'Ended' };
  return { tone: 'slate', label: exam.availability || 'Unavailable' };
};

const LiveWindowCountdown = ({ endAt, onReachEnded }) => {
  const { remainingSeconds } = useCountdown(endAt, {
    enabled: true,
    onExpire: onReachEnded,
  });

  const isUrgent = remainingSeconds <= 300;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
        isUrgent
          ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
            isUrgent ? 'bg-red-400' : 'bg-emerald-400'
          }`}
        ></span>
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isUrgent ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        ></span>
      </span>
      <span>
        Closes in: <span className="font-mono tabular-nums font-bold">{formatSeconds(remainingSeconds)}</span>
      </span>
    </span>
  );
};

const UpcomingCountdown = ({ startAt, onReachLive }) => {
  const { remainingSeconds } = useCountdown(startAt, {
    enabled: true,
    onExpire: onReachLive,
  });

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
      </span>
      <span>Starts in: <span className="font-mono tabular-nums font-bold">{formatSeconds(remainingSeconds)}</span></span>
    </span>
  );
};

const ExamCard = ({ exam, onInvalidate }) => {
  const badge = availabilityBadge(exam);

  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-balance text-base font-bold text-slate-950 dark:text-white">{exam.title}</h3>
          {exam.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{exam.description}</p>
          )}
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
          <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{formatDuration(exam.durationMinutes)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Questions</dt>
          <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{exam.itemCount ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Total marks</dt>
          <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{exam.totalMarks ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Pass mark</dt>
          <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
            {exam.policy?.passPercentage !== undefined ? `${exam.policy.passPercentage}%` : '—'}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Window: {formatDateTime(exam.startAt)} – {formatDateTime(exam.endAt)}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!exam.canResume && exam.availability === 'live' && exam.canStart && (
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn-primary btn-sm" to={`/exams/${exam.id}/instructions`}>
              Start exam
            </Link>
            <LiveWindowCountdown endAt={exam.endAt} onReachEnded={onInvalidate} />
          </div>
        )}
        {exam.canResume && exam.availability === 'live' && (
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn-primary btn-sm" to={`/attempts/${exam.attemptId}`}>
              Resume attempt
            </Link>
            <LiveWindowCountdown endAt={exam.endAt} onReachEnded={onInvalidate} />
          </div>
        )}
        {exam.canResume && exam.availability !== 'live' && (
          <Link className="btn-primary btn-sm" to={`/attempts/${exam.attemptId}`}>
            Resume attempt
          </Link>
        )}
        {exam.availability === 'upcoming' && !exam.attemptStatus && (
          <div className="flex flex-wrap items-center gap-2">
            <UpcomingCountdown startAt={exam.startAt} onReachLive={onInvalidate} />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Opens {formatDateTime(exam.startAt)}
            </span>
          </div>
        )}
        {exam.resultAvailable && exam.attemptId && (
          <Link className="btn-secondary btn-sm" to={`/attempts/${exam.attemptId}/result`}>
            View result
          </Link>
        )}
        {exam.attemptStatus === 'submitted' && !exam.resultAvailable && (
          <span className="badge-slate">Result awaiting release</span>
        )}
        {exam.availability === 'ended' && !exam.attemptStatus && <span className="badge-slate">Not attempted</span>}
      </div>
    </article>
  );
};

const JoinCodeForm = ({ onJoined }) => {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const joinCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,32}$/.test(joinCode)) {
      setError('Use 4–32 letters, numbers, or dashes.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiClient.post('/exams/join', { joinCode });
      const exam = unwrap(response);
      await queryClient.invalidateQueries({ queryKey: ['student-exams'] });
      toast.success(`Added “${exam.title}”.`);
      onJoined?.(exam);
    } catch (requestError) {
      setError(getApiError(requestError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <label className="label" htmlFor="join-code">
        Exam join code
      </label>
      <input
        autoComplete="off"
        autoFocus
        className="input font-mono text-lg uppercase tracking-[0.18em]"
        id="join-code"
        maxLength={32}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="PHY-LIVE"
        value={code}
      />
      {error && <InlineError>{error}</InlineError>}
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        Your teacher shares this code for exams outside your assigned batch. Codes are not case-sensitive.
      </p>
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy ? 'Checking code…' : 'Join exam'}
      </button>
    </form>
  );
};

export const StudentExamsPanel = ({
  heading = true,
  initialTab = 'all',
  title = 'My exams',
  description = 'Everything assigned to your batch, plus exams you join with a code.',
}) => {
  const [tab, setTab] = useState(initialTab);
  const [joinOpen, setJoinOpen] = useState(false);
  const query = useQuery({
    queryKey: ['student-exams', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/exams/available', { params: { scope: 'all', limit: 100 } });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const rows = query.data?.rows || [];
  const counts = useMemo(
    () => ({
      all: rows.length,
      live: rows.filter((exam) => exam.availability === 'live' && exam.attemptStatus !== 'submitted').length,
      upcoming: rows.filter((exam) => exam.availability === 'upcoming').length,
      past: rows.filter((exam) => exam.availability === 'ended' || exam.attemptStatus === 'submitted').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    if (tab === 'all') return rows;
    if (tab === 'past') return rows.filter((exam) => exam.availability === 'ended' || exam.attemptStatus === 'submitted');
    if (tab === 'live') return rows.filter((exam) => exam.availability === 'live' && exam.attemptStatus !== 'submitted');
    return rows.filter((exam) => exam.availability === tab);
  }, [rows, tab]);

  return (
    <section>
      {heading && (
        <PageHeader
          actions={
            <button className="btn-secondary" onClick={() => setJoinOpen(true)} type="button">
              <span aria-hidden="true">＋</span> Join with code
            </button>
          }
          description={description}
          kicker="Student"
          title={title}
        />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-card">
          <p className="stat-label">Live now</p>
          <p className="stat-value">{counts.live}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Upcoming</p>
          <p className="stat-value">{counts.upcoming}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Submitted</p>
          <p className="stat-value">{rows.filter((exam) => exam.attemptStatus === 'submitted').length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total exams</p>
          <p className="stat-value">{rows.length}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Exam filters" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900" role="tablist">
          {tabs.map((item) => (
            <button
              aria-selected={tab === item.value}
              className={`min-h-10 shrink-0 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                tab === item.value
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
              key={item.value}
              onClick={() => setTab(item.value)}
              role="tab"
              type="button"
            >
              {item.label}
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-700">{counts[item.value]}</span>
            </button>
          ))}
        </div>
        {!heading && (
          <button className="btn-secondary btn-sm" onClick={() => setJoinOpen(true)} type="button">
            Join with code
          </button>
        )}
      </div>

      {query.isPending && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton h-56" key={index} />
          ))}
        </div>
      )}

      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}

      {query.isSuccess && visible.length === 0 && (
        <EmptyState
          icon="▣"
          message={
            rows.length === 0
              ? 'No exams are assigned to your batch yet. Ask your teacher for a join code.'
              : 'Nothing in this tab right now. Try another filter.'
          }
          title={rows.length === 0 ? 'No exams yet' : 'Nothing here'}
        />
      )}

      {query.isSuccess && visible.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((exam) => (
            <ExamCard
              exam={exam}
              key={exam.id}
              onInvalidate={() => queryClient.invalidateQueries({ queryKey: ['student-exams'] })}
            />
          ))}
        </div>
      )}

      <Modal
        onClose={() => setJoinOpen(false)}
        open={joinOpen}
        size="sm"
        title="Join an exam"
        description="Enter the code your teacher shared."
      >
        <JoinCodeForm
          onJoined={() => {
            setJoinOpen(false);
          }}
        />
      </Modal>
    </section>
  );
};

export default StudentExamsPanel;
