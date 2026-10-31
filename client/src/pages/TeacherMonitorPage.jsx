import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState } from '../components/States';
import { Avatar, Badge, Input, PageHeader, Pagination, Select, StatCard } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatDateTime, statusMeta } from '../utils/format';

const statusTone = (status) => (status === 'submitted' ? 'green' : status === 'in_progress' ? 'amber' : 'slate');
const violationLabels = {
  tab_hidden: 'Tab switching',
  window_blur: 'Window lost focus',
  fullscreen_exit: 'Fullscreen exited',
  copy: 'Copy attempt',
  paste: 'Paste attempt',
  context_menu: 'Context menu',
  shortcut: 'Restricted shortcut',
  other: 'Other violation',
};

export const TeacherMonitorPage = () => {
  const { examId } = useParams();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ['monitor', examId, { status, q, page }],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}/monitor`, {
        params: { page, limit: 20, ...(status ? { status } : {}), ...(q ? { q } : {}) },
      });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
    refetchInterval: 10_000,
  });

  const rows = query.data?.rows || [];
  const meta = query.data?.meta;
  const counts = meta?.counts || {};

  return (
    <section>
      <PageHeader
        actions={
          <Link className="btn-secondary" to={`/exams/${examId}`}>
            Exam overview
          </Link>
        }
        description="Live progress and proctoring signals. Student answers stay hidden until submission."
        kicker="Teacher monitor"
        title="Live monitor"
      >
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-emerald-500" />
          Auto-refreshing every 10 seconds
          {meta?.serverTime && <span>· server time {formatDateTime(meta.serverTime)}</span>}
        </p>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint="Eligible students" label="Not started" value={query.isPending ? '—' : counts.notStarted ?? 0} />
        <StatCard hint="Currently writing" label="In progress" value={query.isPending ? '—' : counts.inProgress ?? 0} />
        <StatCard hint="Attempts received" label="Submitted" value={query.isPending ? '—' : counts.submitted ?? 0} />
        <StatCard hint="Counts refresh with the list" label="Rows" value={query.isPending ? '—' : meta?.total ?? 0} />
      </div>

      <div className="card mt-5 mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="monitor-search">Search students</label>
          <Input
            id="monitor-search"
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Name or email…"
            type="search"
            value={search}
          />
        </div>
        <div className="sm:w-48">
          <label className="label" htmlFor="monitor-status">Status</label>
          <Select
            id="monitor-status"
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
          </Select>
        </div>
      </div>

      {query.isPending && <div className="skeleton h-64" />}
      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}
      {query.isSuccess && rows.length === 0 && (
        <EmptyState icon="◷" message="No students match this filter yet." title="Nothing to show" />
      )}

      {rows.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Answers</th>
                    <th>Violations</th>
                    <th>Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.student.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.student.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">{row.student.name}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.student.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(row.status)}>{statusMeta(row.status).label}</Badge>
                      </td>
                      <td className="font-semibold">{row.answerCount}</td>
                      <td>
                        {row.violationCount > 0 ? (
                          <details className="min-w-48">
                            <summary className="cursor-pointer font-bold text-amber-700 dark:text-amber-300">
                              {row.violationCount} recorded
                            </summary>
                            <div className="mt-2 space-y-1.5 text-xs">
                              {Object.entries(row.violationSummary || {}).map(([type, count]) => (
                                <div className="flex justify-between gap-3" key={type}>
                                  <span>{violationLabels[type] || type}</span>
                                  <strong>{count}</strong>
                                </div>
                              ))}
                              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                                {(row.violations || []).slice().reverse().map((violation, index) => (
                                  <div className="py-1 text-slate-500 dark:text-slate-400" key={`${violation.occurredAt}-${index}`}>
                                    {violationLabels[violation.type] || violation.type} · {formatDateTime(violation.occurredAt)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </details>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {row.status === 'submitted' && <span>Submitted {formatDateTime(row.submittedAt)}</span>}
                        {row.status === 'in_progress' && <span>Expires {formatDateTime(row.expiresAt)}</span>}
                        {row.status === 'not_started' && <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination label="students" meta={meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
};

export default TeacherMonitorPage;
