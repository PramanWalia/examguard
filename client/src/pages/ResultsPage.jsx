import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState } from '../components/States';
import { Avatar, Badge, Input, PageHeader, Pagination, StatCard } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatPercent } from '../utils/format';

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const ResultsPage = () => {
  const { examId } = useParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ['results', examId, { q, page }],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}/results`, {
        params: { page, limit: 20, ...(q ? { q } : {}) },
      });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const rows = query.data?.rows || [];
  const meta = query.data?.meta;
  const passed = rows.filter((row) => row.passed).length;
  const average = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / rows.length) * 10) / 10
    : 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await apiClient.get(`/exams/${examId}/results/export.csv`, { responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      downloadBlob(response.data, match?.[1] || 'exam-results.csv');
      toast.success('Results exported.');
    } catch (error) {
      toast.error(getApiError(error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section>
      <PageHeader
        actions={
          <>
            <Link className="btn-secondary" to={`/exams/${examId}/analytics`}>
              Analytics
            </Link>
            <button className="btn-primary" disabled={exporting} onClick={exportCsv} type="button">
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </>
        }
        description="Submitted attempts only. Open a student result from the API for item-level review."
        kicker="Teacher results"
        title="Results"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint="Submitted attempts" label="Results" value={query.isPending ? '—' : meta?.total ?? 0} />
        <StatCard hint="On this page" label="Passed" value={query.isPending ? '—' : passed} />
        <StatCard hint="On this page" label="Average" value={query.isPending ? '—' : formatPercent(average)} />
        <StatCard hint="Results on this page" label="Pass rate" value={query.isSuccess && rows.length ? formatPercent((passed / rows.length) * 100) : '—'} />
      </div>

      <div className="card mt-5 mb-5 p-4">
        <label className="label" htmlFor="results-search">Search students</label>
        <Input
          id="results-search"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Name or email…"
          type="search"
          value={search}
        />
      </div>

      {query.isPending && <div className="skeleton h-64" />}
      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}
      {query.isSuccess && rows.length === 0 && (
        <EmptyState
          icon="▤"
          message={q ? 'No submitted attempt matches this student.' : 'Results appear here as students submit. If results are hidden, use the exam overview to release them.'}
          title="No results yet"
        />
      )}

      {rows.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Outcome</th>
                    <th>Submitted</th>
                    <th>Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.attemptId}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.student?.name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">{row.student?.name}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.student?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap font-semibold">
                        {row.score} <span className="text-xs font-normal text-slate-500">/ {row.maxScore}</span>
                      </td>
                      <td className="font-semibold">{formatPercent(row.percentage)}</td>
                      <td>
                        <Badge tone={row.passed ? 'green' : 'red'}>{row.passed ? 'Passed' : 'Failed'}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(row.submittedAt)}</td>
                      <td>
                        <span className={row.violationCount > 0 ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>
                          {row.violationCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination label="results" meta={meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
};

export default ResultsPage;
