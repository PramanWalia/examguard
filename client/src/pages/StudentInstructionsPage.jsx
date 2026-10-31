import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap } from '../api/client';
import { ErrorState, LoadingState } from '../components/States';
import { Badge, PageHeader } from '../components/ui';
import { useCountdown } from '../hooks/useCountdown';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatDuration, formatSeconds } from '../utils/format';

const checks = [
  { key: 'browser', label: 'Modern browser with JavaScript', test: () => true, detail: 'React 18 is running.' },
  {
    key: 'online',
    label: 'Internet connection',
    test: () => navigator.onLine,
    detail: 'Autosave retries if the signal drops, but a stable connection is best.',
  },
  {
    key: 'storage',
    label: 'Browser storage available',
    test: () => {
      try {
        window.sessionStorage.setItem('examguard-check', '1');
        window.sessionStorage.removeItem('examguard-check');
        return true;
      } catch {
        return false;
      }
    },
    detail: 'Used only for the local mock/theme. The server owns your answers.',
  },
  {
    key: 'fullscreen',
    label: 'Fullscreen available',
    test: () => Boolean(document.documentElement.requestFullscreen),
    detail: 'Recommended for a distraction-free attempt. You can still continue without it.',
  },
];

export const StudentInstructionsPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const query = useQuery({
    queryKey: ['student-exam', examId],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}`);
      return unwrap(response);
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      // Ask for fullscreen while the click is still a user gesture.
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Not fatal: the attempt screen shows an "Enter fullscreen" button.
        }
      }
      const response = await apiClient.post(`/exams/${examId}/start`);
      return unwrap(response);
    },
    onSuccess: (attempt) => {
      navigate(`/attempts/${attempt.attemptId}`, { replace: true });
    },
    onError: (error) => {
      const apiError = getApiError(error);
      if (apiError.code === 'ALREADY_ATTEMPTED') {
        toast.error('You have already submitted this exam.');
        navigate('/results', { replace: true });
        return;
      }
      toast.error(apiError.message);
    },
  });

  const exam = query.data;
  const canStart = exam && exam.availability === 'live' && exam.canStart !== false && !exam.attemptStatus;
  const canResume = exam?.attemptStatus === 'in_progress' && exam?.attemptId;
  const isUpcoming = exam?.availability === 'upcoming' && !exam?.attemptStatus;
  const isLive = exam?.availability === 'live' && !exam?.attemptStatus;

  const { remainingSeconds: upcomingRemaining } = useCountdown(exam?.startAt, {
    enabled: Boolean(isUpcoming && exam?.startAt),
    onExpire: () => {
      queryClient.invalidateQueries({ queryKey: ['student-exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['student-exams'] });
    },
  });

  const { remainingSeconds: liveRemaining } = useCountdown(exam?.endAt, {
    enabled: Boolean(isLive && exam?.endAt),
    onExpire: () => {
      queryClient.invalidateQueries({ queryKey: ['student-exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['student-exams'] });
    },
  });

  if (query.isPending) return <LoadingState label="Loading exam instructions" />;
  if (query.isError) return <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        actions={
          <Link className="btn-secondary" to="/dashboard">
            Back to dashboard
          </Link>
        }
        description={exam.description || 'Read the instructions before the timer starts.'}
        kicker="Exam instructions"
        title={exam.title}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={exam.availability === 'live' ? 'green' : 'amber'}>{exam.availability}</Badge>
        <Badge tone="slate">{formatDuration(exam.durationMinutes)}</Badge>
        <Badge tone="slate">{exam.itemCount ?? 0} questions</Badge>
        <Badge tone="slate">{exam.totalMarks ?? 0} marks</Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="panel">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">How this attempt works</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
            <li><span className="font-semibold text-slate-900 dark:text-white">The server owns the clock.</span> The countdown reconciles with server time. Closing the tab does not pause or extend your attempt.</li>
            <li><span className="font-semibold text-slate-900 dark:text-white">Answers save automatically.</span> Each change is queued and retried. A “Saved” indicator confirms the server accepted it.</li>
            <li><span className="font-semibold text-slate-900 dark:text-white">You can move freely.</span> Use the palette or arrow keys. Mark questions for review and return before submitting.</li>
            <li><span className="font-semibold text-slate-900 dark:text-white">Submit once.</span> Submitting is idempotent. If the timer runs out, the server finalizes your saved answers automatically.</li>
            <li><span className="font-semibold text-slate-900 dark:text-white">Results follow the release policy.</span> Your score appears only when the exam’s result mode allows it.</li>
          </ol>

          <div className="divider" />

          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Rules and integrity</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            <li>· Tab switches, lost focus, copy/paste, and leaving fullscreen are recorded as proctoring signals.</li>
            <li>· The violation limit is <span className="font-semibold text-slate-900 dark:text-white">{exam.policy?.violationLimit ?? '—'}</span>{exam.policy?.autoSubmitOnViolation ? '; reaching it submits your attempt.' : '.'}</li>
            <li>· Do not refresh unnecessarily. If you do, the same attempt resumes with saved answers.</li>
            <li>· Pass mark: <span className="font-semibold text-slate-900 dark:text-white">{exam.policy?.passPercentage ?? '—'}%</span>.</li>
          </ul>
        </div>

        <aside className="space-y-5">
          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">System check</h2>
            <ul className="mt-3 space-y-3">
              {checks.map((check) => {
                const passed = check.test();
                return (
                  <li className="flex gap-2.5" key={check.key}>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                        passed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {passed ? '✓' : '!'}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">{check.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{check.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Window</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Opens {formatDateTime(exam.startAt)}<br />
              Closes {formatDateTime(exam.endAt)}
            </p>
            {canResume ? (
              <Link className="btn-primary mt-4 w-full" to={`/attempts/${exam.attemptId}`}>
                Resume in-progress attempt
              </Link>
            ) : exam.attemptStatus === 'submitted' ? (
              <div className="mt-4">
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                  You have already submitted this exam.
                </p>
                {exam.resultAvailable && (
                  <Link className="btn-primary mt-3 w-full" to={`/attempts/${exam.attemptId}/result`}>
                    View result
                  </Link>
                )}
              </div>
            ) : (
              <>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    checked={agreed}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                    onChange={(event) => setAgreed(event.target.checked)}
                    type="checkbox"
                  />
                  I have read the rules and I am ready to begin.
                </label>
                <button
                  className="btn-primary mt-4 w-full"
                  disabled={!canStart || !agreed || start.isPending}
                  onClick={() => start.mutate()}
                  type="button"
                >
                  {start.isPending
                    ? 'Starting…'
                    : canStart
                      ? 'Start exam'
                      : isUpcoming
                        ? `Starts in ${formatSeconds(upcomingRemaining)}`
                        : 'Not open yet'}
                </button>
                {canStart && (
                  <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-center dark:border-emerald-700/60 dark:bg-emerald-950/40">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      Window closes in <span className="font-mono text-sm font-bold">{formatSeconds(liveRemaining)}</span>
                    </p>
                  </div>
                )}
                {!canStart && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-center dark:border-amber-700/60 dark:bg-amber-950/40">
                    {isUpcoming ? (
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Exam starts in <span className="font-mono text-sm font-bold">{formatSeconds(upcomingRemaining)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        This exam opens {formatDateTime(exam.startAt)}. The button unlocks during the live window.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default StudentInstructionsPage;
