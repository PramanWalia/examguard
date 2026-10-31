import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState } from '../components/States';
import { Badge, Input, PageHeader, Pagination, Select, StatCard } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatDuration, phaseMeta, statusMeta } from '../utils/format';

export const ExamsPage = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const q = useDebouncedValue(search, 300);
  const deleteExam = useMutation({
    mutationFn: (id) => apiClient.delete(`/exams/${id}`),
    onSuccess: async () => {
      toast.success('Exam deleted.');
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const query = useQuery({
    queryKey: ['exams', { status, q, page }],
    queryFn: async () => {
      const response = await apiClient.get('/exams', {
        params: { page, limit: 9, ...(status ? { status } : {}), ...(q ? { q } : {}) },
      });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const rows = query.data?.rows || [];
  const meta = query.data?.meta;
  const summary = meta?.summary || {};

  return (
    <section>
      <PageHeader
        actions={
          <Link className="btn-primary" to="/exams/new">
            <span aria-hidden="true">＋</span> New exam
          </Link>
        }
        description="Draft, publish, and monitor every assessment you own."
        kicker="Teacher"
        title="Exams"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint="Published" label="Live now" value={query.isPending ? '—' : summary.live ?? 0} />
        <StatCard hint="Published" label="Upcoming" value={query.isPending ? '—' : summary.upcoming ?? 0} />
        <StatCard hint="All time" label="Ended" value={query.isPending ? '—' : summary.ended ?? 0} />
        <StatCard hint="Not published" label="Drafts" value={query.isPending ? '—' : summary.draft ?? 0} />
      </div>

      <div className="card mt-5 mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="exam-search">Search</label>
          <Input
            id="exam-search"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Search exam title…"
            type="search"
            value={search}
          />
        </div>
        <div className="sm:w-48">
          <label className="label" htmlFor="exam-status">Status</label>
          <Select
            id="exam-status"
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="draft">Drafts</option>
            <option value="published">Published</option>
          </Select>
        </div>
      </div>

      {query.isPending && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton h-52" key={index} />
          ))}
        </div>
      )}
      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}
      {query.isSuccess && rows.length === 0 && (
        <EmptyState
          action={
            <Link className="btn-primary btn-sm" to="/exams/new">
              Create an exam
            </Link>
          }
          icon="▣"
          message={status || q ? 'No exams match these filters.' : 'Build a draft from your question bank and publish it when ready.'}
          title={status || q ? 'No matching exams' : 'No exams yet'}
        />
      )}

      {rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((exam) => {
            const phase = phaseMeta(exam.phase);
            const isDraft = exam.status === 'draft';
            return (
              <article className="card flex flex-col p-5" key={exam.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-balance font-bold text-slate-950 dark:text-white">{exam.title}</h2>
                  <div className="flex gap-1.5">
                    <Badge tone={isDraft ? 'slate' : 'brand'}>{statusMeta(exam.status).label}</Badge>
                    {!isDraft && <Badge tone={phase.tone}>{phase.label}</Badge>}
                  </div>
                </div>
                {exam.description && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{exam.description}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Starts</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{formatDateTime(exam.startAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{formatDuration(exam.durationMinutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Questions</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{exam.itemCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Total marks</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">{exam.totalMarks ?? 0}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  <Link className="btn-secondary btn-sm" to={`/exams/${exam.id}`}>
                    {isDraft ? 'Continue editing' : 'Overview'}
                  </Link>
                  {!isDraft && (exam.phase === 'live' || exam.phase === 'ended') && (
                    <Link className="btn-ghost btn-sm" to={`/exams/${exam.id}/monitor`}>
                      Monitor
                    </Link>
                  )}
                  {!isDraft && (
                    <Link className="btn-ghost btn-sm" to={`/exams/${exam.id}/analytics`}>
                      Analytics
                    </Link>
                  )}
                  <button
                    className="btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                    disabled={deleteExam.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${exam.title}"? This also removes its attempts and cannot be undone.`)) {
                        deleteExam.mutate(exam.id);
                      }
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Pagination label="exams" meta={meta} onPageChange={setPage} />
    </section>
  );
};

export default ExamsPage;
