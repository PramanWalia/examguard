import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import apiClient, { unwrap } from '../api/client';
import { EmptyState, ErrorState } from '../components/States';
import { Badge, PageHeader } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatPercent } from '../utils/format';

const tabs = [
  { value: 'available', label: 'Available' },
  { value: 'pending', label: 'Pending release' },
];

export const StudentResultsPage = () => {
  const [tab, setTab] = useState('available');
  const query = useQuery({
    queryKey: ['student-exams', 'results'],
    queryFn: async () => {
      const response = await apiClient.get('/exams/available', { params: { scope: 'all', limit: 100 } });
      return unwrap(response) || [];
    },
  });

  const submitted = useMemo(
    () => (query.data || []).filter((exam) => exam.attemptStatus === 'submitted' && exam.attemptId),
    [query.data],
  );
  const available = submitted.filter((exam) => exam.resultAvailable);
  const pending = submitted.filter((exam) => !exam.resultAvailable);
  const rows = tab === 'available' ? available : pending;

  return (
    <section>
      <PageHeader
        description="Scores appear only after the exam’s release policy allows them. Pending attempts stay listed here."
        kicker="Student"
        title="Results"
      />

      <div aria-label="Result filters" className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900" role="tablist">
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
            <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] dark:bg-slate-700">
              {item.value === 'available' ? available.length : pending.length}
            </span>
          </button>
        ))}
      </div>

      {query.isPending && <div className="skeleton h-48" />}
      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}

      {query.isSuccess && rows.length === 0 && (
        <EmptyState
          icon="▤"
          message={
            submitted.length === 0
              ? 'Once you submit an exam, its result will be tracked here.'
              : 'Nothing in this tab. Results may still be waiting for release.'
          }
          title={tab === 'available' ? 'No released results yet' : 'No pending results'}
        />
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((exam) => (
            <article className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={exam.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-slate-950 dark:text-white">{exam.title}</h2>
                  {exam.resultAvailable ? (
                    <Badge tone={exam.passed ? 'green' : 'red'}>{exam.passed ? 'Passed' : 'Failed'}</Badge>
                  ) : (
                    <Badge tone="amber">Awaiting release</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {exam.resultAvailable
                    ? `${formatPercent(exam.percentage)}${exam.score !== null && exam.score !== undefined ? ` · ${exam.score}/${exam.totalMarks} marks` : ''}`
                    : `Submitted · window closed ${formatDateTime(exam.endAt)}`}
                </p>
              </div>
              {exam.resultAvailable ? (
                <Link className="btn-primary btn-sm shrink-0" to={`/attempts/${exam.attemptId}/result`}>
                  Open result
                </Link>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">Your teacher has not released this result.</span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default StudentResultsPage;
