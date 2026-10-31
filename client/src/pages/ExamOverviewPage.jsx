import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap } from '../api/client';
import { ErrorState, LoadingState } from '../components/States';
import { Badge, CopyButton, PageHeader } from '../components/ui';
import { useCopy } from '../hooks/useCopy';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatDuration, phaseMeta, statusMeta } from '../utils/format';

export const ExamOverviewPage = () => {
  const { examId } = useParams();
  const queryClient = useQueryClient();
  const copy = useCopy();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['exam', examId],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}`);
      return unwrap(response);
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/exams/${examId}/publish`);
      return unwrap(response);
    },
    onSuccess: async (data) => {
      toast.success(data.joinCode ? `Published. Join code: ${data.joinCode}` : 'Exam published.');
      await queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const release = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/exams/${examId}/release-results`);
      return unwrap(response);
    },
    onSuccess: async () => {
      toast.success('Results released to students.');
      await queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const deleteExam = useMutation({
    mutationFn: () => apiClient.delete(`/exams/${examId}`),
    onSuccess: async () => {
      toast.success('Exam deleted.');
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      navigate('/exams', { replace: true });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  if (query.isPending) return <LoadingState label="Loading exam" />;
  if (query.isError) return <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />;

  const exam = query.data;
  const phase = phaseMeta(exam.phase);
  const isDraft = exam.status === 'draft';
  const totalMarks = exam.items?.reduce((sum, item) => sum + Number(item.marks || 0), 0) || 0;

  return (
    <section>
      <PageHeader
        actions={
          <>
            {isDraft ? (
              <Link className="btn-primary" to={`/exams/${exam.id}/edit`}>
                Continue editing
              </Link>
            ) : (
              <>
                <Link className="btn-secondary" to={`/exams/${exam.id}/edit`}>
                  Edit schedule
                </Link>
                <Link className="btn-secondary" to={`/exams/${exam.id}/monitor`}>
                  Monitor
                </Link>
                <Link className="btn-secondary" to={`/exams/${exam.id}/analytics`}>
                  Analytics
                </Link>
                <Link className="btn-primary" to={`/exams/${exam.id}/results`}>
                  Results
                </Link>
              </>
            )}
            <button
              className="btn-ghost text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
              disabled={deleteExam.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${exam.title}"? This also removes its attempts and cannot be undone.`)) {
                  deleteExam.mutate();
                }
              }}
              type="button"
            >
              Delete
            </button>
          </>
        }
        description={exam.description || 'No description was added for this exam.'}
        kicker="Exam"
        title={exam.title}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={isDraft ? 'slate' : 'brand'}>{statusMeta(exam.status).label}</Badge>
        {!isDraft && <Badge tone={phase.tone}>{phase.label}</Badge>}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {exam.items?.length || 0} questions · {totalMarks} marks · {formatDuration(exam.durationMinutes)}
        </span>
      </div>

      {isDraft && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="font-bold text-amber-950 dark:text-amber-100">This exam is still a draft</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900/90 dark:text-amber-200/90">
            Students cannot see or join it. Publishing freezes question snapshots and generates a join code if enabled.
          </p>
          <button className="btn-primary btn-sm mt-3" disabled={publish.isPending} onClick={() => publish.mutate()} type="button">
            {publish.isPending ? 'Publishing…' : 'Publish exam'}
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="panel">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Schedule</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Opens</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatDateTime(exam.startAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Closes</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatDateTime(exam.endAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Duration</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatDuration(exam.durationMinutes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Result mode</dt>
              <dd className="mt-1 text-sm font-semibold capitalize text-slate-900 dark:text-white">{exam.resultMode?.replaceAll('_', ' ')}</dd>
            </div>
          </dl>

          <div className="divider" />

          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Attempt rules</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Pass mark</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{exam.settings?.passPercentage}%</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Violation limit</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {exam.settings?.violationLimit || 'Disabled'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Shuffle questions</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{exam.settings?.shuffleQuestions ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Auto-submit on violation</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{exam.settings?.autoSubmitOnViolation ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-5">
          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Join code</h2>
            {exam.joinCode ? (
              <>
                <p className="mt-2 font-mono text-2xl font-bold tracking-[0.12em] text-slate-950 dark:text-white">{exam.joinCode}</p>
                <div className="mt-3">
                  <CopyButton onCopy={copy} value={exam.joinCode} />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Students can enter this code from their dashboard.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                A code is generated when the exam is published and join-code access is enabled.
              </p>
            )}
          </div>

          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Audience</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(exam.assignment?.batchIds || []).length ? (
                exam.assignment.batchIds.map((batch) => <Badge key={batch} tone="slate">{batch}</Badge>)
              ) : (
                <span className="text-sm text-slate-600 dark:text-slate-400">Join code only</span>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {exam.assignment?.joinCodeEnabled ? 'Join-code access is enabled.' : 'Join-code access is disabled.'}
            </p>
          </div>

          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Results</h2>
            {exam.resultsReleasedAt ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Released {formatDateTime(exam.resultsReleasedAt)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Not released yet. Mode: <span className="font-semibold capitalize">{exam.resultMode?.replaceAll('_', ' ')}</span>.
              </p>
            )}
            {!isDraft && !exam.resultsReleasedAt && (
              <button className="btn-secondary btn-sm mt-3" disabled={release.isPending} onClick={() => release.mutate()} type="button">
                {release.isPending ? 'Releasing…' : 'Release results now'}
              </button>
            )}
          </div>
        </div>
      </div>

      {!isDraft && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn-secondary" to={`/exams/${exam.id}/monitor`}>Live monitor</Link>
          <Link className="btn-secondary" to={`/exams/${exam.id}/results`}>Student results</Link>
          <Link className="btn-secondary" to={`/exams/${exam.id}/analytics`}>Analytics</Link>
        </div>
      )}
    </section>
  );
};

export default ExamOverviewPage;
