import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import apiClient, { unwrap } from '../api/client';
import { ErrorState, LoadingState } from '../components/States';
import { Avatar, Badge, PageHeader, ProgressBar, StatCard } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatPercent, formatSeconds } from '../utils/format';

const chartTooltipStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 12,
  color: '#f8fafc',
  fontSize: 12,
};

export const AnalyticsPage = () => {
  const { examId } = useParams();
  const query = useQuery({
    queryKey: ['analytics', examId],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}/analytics`);
      return unwrap(response);
    },
  });

  if (query.isPending) return <LoadingState label="Loading analytics" />;
  if (query.isError) return <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />;

  const data = query.data;
  const passFail = [
    { name: 'Passed', value: data.passCount, color: '#10b981' },
    { name: 'Failed', value: data.failCount, color: '#ef4444' },
  ];
  const hasSubmissions = data.submittedCount > 0;

  return (
    <section>
      <PageHeader
        actions={
          <>
            <Link className="btn-secondary" to={`/exams/${examId}/results`}>
              Results table
            </Link>
            <Link className="btn-primary" to={`/exams/${examId}/monitor`}>
              Live monitor
            </Link>
          </>
        }
        description={`Aggregate performance for ${data.examTitle}. No individual answers are exposed here.`}
        kicker="Teacher analytics"
        title="Exam analytics"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint={`${data.inProgressCount} in progress`} label="Attempts" value={data.attemptCount} />
        <StatCard hint={`${data.notStartedCount} have not started`} label="Submitted" value={data.submittedCount} />
        <StatCard hint={`Pass mark ${data.passPercentage}%`} label="Average score" value={formatPercent(data.averagePercentage)} />
        <StatCard hint="Of submitted attempts" label="Pass rate" value={hasSubmissions ? formatPercent((data.passCount / data.submittedCount) * 100) : '—'} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="panel">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Score distribution</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Percentage bands across submitted attempts.</p>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data.scoreDistribution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} />
                <YAxis allowDecimals={false} fontSize={11} stroke="#94a3b8" tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="count" fill="#6366f1" name="Students" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Outcome</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pass/fail split for submitted attempts.</p>
          {hasSubmissions ? (
            <>
              <div className="mx-auto mt-2 h-48 w-full max-w-xs">
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    <Pie data={passFail} dataKey="value" innerRadius={52} nameKey="name" outerRadius={78} paddingAngle={3}>
                      {passFail.map((entry) => (
                        <Cell fill={entry.color} key={entry.name} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Passed</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">{data.passCount}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-red-700 dark:text-red-300">Failed</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">{data.failCount}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No submitted attempts yet.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="panel">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Item difficulty</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Correctness among students who attempted each item. Low percentages identify questions to review.
          </p>
          <div className="mt-4 space-y-4">
            {data.itemStats.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No items in this exam.</p>}
            {data.itemStats.map((item, index) => (
              <div key={item.itemId}>
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="mr-1 font-bold text-slate-400">{index + 1}.</span>
                    {item.prompt}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {item.attemptedCount ? formatPercent(item.correctPercentage) : '—'}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    label={`${item.correctCount}/${item.attemptedCount} correct · avg ${item.averageAwardedMarks} marks`}
                    max={100}
                    value={item.correctPercentage}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Leaderboard</h2>
            <Badge tone="brand">Top {Math.min(10, data.leaderboard.length)}</Badge>
          </div>
          {data.leaderboard.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No submitted attempts to rank.</p>
          )}
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.leaderboard.slice(0, 10).map((row) => (
              <li className="flex items-center gap-3 py-3" key={row.studentId}>
                <span className="w-6 text-center text-xs font-bold text-slate-400">#{row.rank}</span>
                <Avatar name={row.studentName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.studentName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatPercent(row.percentage)}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{row.score}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
            <p>Average time: <span className="font-semibold text-slate-900 dark:text-white">{formatSeconds(data.averageTimeSeconds)}</span></p>
            <p className="mt-1">Per question: <span className="font-semibold text-slate-900 dark:text-white">{formatSeconds(data.averageTimePerQuestionSeconds)}</span></p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsPage;
