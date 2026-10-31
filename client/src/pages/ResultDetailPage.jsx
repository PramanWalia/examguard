import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import apiClient, { unwrap } from '../api/client';
import { ErrorState, LoadingState } from '../components/States';
import { Badge, PageHeader } from '../components/ui';
import { getApiError } from '../utils/errors';
import { formatDate, formatDateTime, formatPercent, formatSeconds } from '../utils/format';

const optionLabel = (item, id) => {
  const index = (item.options || []).findIndex((option) => option.id === id);
  if (index < 0) return id;
  return `${String.fromCharCode(65 + index)}. ${item.options[index].text}`;
};

export const ResultDetailPage = () => {
  const { attemptId } = useParams();
  const query = useQuery({
    queryKey: ['result', attemptId],
    queryFn: async () => {
      const response = await apiClient.get(`/attempts/${attemptId}/result`);
      return unwrap(response);
    },
    retry: (failureCount, error) => {
      const status = error?.response?.status;
      if (status === 403) return false;
      return failureCount < 1;
    },
  });

  if (query.isPending) return <LoadingState label="Loading result" />;

  if (query.isError) {
    const apiError = getApiError(query.error);
    if (apiError.code === 'RESULT_NOT_AVAILABLE') {
      const availableAt = apiError.details?.[0]?.availableAt;
      return (
        <div className="mx-auto max-w-2xl">
          <PageHeader kicker="Result" title="Not released yet" />
          <div className="panel text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              ◷
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">Your result is still sealed</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
              {availableAt
                ? `Results are expected after ${formatDateTime(availableAt)}.`
                : 'Your teacher will release this result after the exam window closes.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link className="btn-primary" to="/results">Back to results</Link>
              <Link className="btn-secondary" to="/dashboard">Dashboard</Link>
            </div>
          </div>
        </div>
      );
    }

    return <ErrorState message={apiError.message} onRetry={query.refetch} />;
  }

  const result = query.data;
  const items = result.items || [];
  const correctCount = items.filter((item) => item.isCorrect).length;
  const history = (result.scoreHistory || []).map((entry) => ({
    ...entry,
    label: formatDate(entry.submittedAt),
    percentage: Number(entry.percentage || 0),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        actions={
          <Link className="btn-secondary" to="/results">
            All results
          </Link>
        }
        description={result.exam?.title || 'Attempt result'}
        kicker="Result"
        title={result.passed ? 'You passed.' : 'Keep going.'}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel">
          <p className="stat-label">Score</p>
          <p className="stat-value">{result.score} <span className="text-base font-medium text-slate-500">/ {result.maxScore}</span></p>
        </div>
        <div className="panel">
          <p className="stat-label">Percentage</p>
          <p className="stat-value">{formatPercent(result.percentage)}</p>
        </div>
        <div className="panel">
          <p className="stat-label">Outcome</p>
          <div className="mt-2">
            <Badge tone={result.passed ? 'green' : 'red'}>{result.passed ? 'Passed' : 'Failed'}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pass mark {result.passPercentage}%</p>
        </div>
        <div className="panel">
          <p className="stat-label">Time taken</p>
          <p className="stat-value">{formatSeconds(result.timeTakenSeconds)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Submitted {formatDateTime(result.submittedAt)}</span>
        <span>·</span>
        <span>{correctCount} of {items.length} correct</span>
        <span>·</span>
        <span>{result.violationCount || 0} proctoring signals</span>
      </div>

      {history.length > 1 && (
        <div className="panel mt-5">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Your score history</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Released attempts only, oldest to newest.</p>
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" tickLine={false} />
                <YAxis domain={[0, 100]} fontSize={11} stroke="#94a3b8" tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f8fafc', fontSize: 12 }}
                  formatter={(value) => [`${value}%`, 'Score']}
                />
                <Line dataKey="percentage" dot={{ r: 4 }} name="Score" stroke="#6366f1" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Question review</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Correct answers and explanations are shown only after release.</p>
        </div>

        <ol className="space-y-3">
          {items.map((item, index) => (
            <li className={`card p-5 ${item.isCorrect ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'}`} key={item.itemId || index}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  <span className="mr-1.5 text-slate-400">{item.order ?? index + 1}.</span>
                  {item.prompt || 'Question text is available in the exam paper.'}
                </p>
                <Badge tone={item.isCorrect ? 'green' : 'red'}>
                  {item.isCorrect ? 'Correct' : 'Incorrect'} · {item.awardedMarks} marks
                </Badge>
              </div>

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your answer</p>
                  {item.numericValue !== null && item.numericValue !== undefined ? (
                    <p className="mt-1 font-mono text-slate-900 dark:text-white">{item.numericValue}</p>
                  ) : (item.selectedOptionIds || []).length ? (
                    <ul className="mt-1 space-y-1">
                      {item.selectedOptionIds.map((id) => (
                        <li key={id}>{optionLabel(item, id)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 italic text-slate-500 dark:text-slate-400">No answer submitted</p>
                  )}
                </div>

                <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Correct answer</p>
                  {item.numericAnswer !== null && item.numericAnswer !== undefined ? (
                    <p className="mt-1 font-mono text-emerald-900 dark:text-emerald-100">{item.numericAnswer}</p>
                  ) : (item.correctOptionIds || []).length ? (
                    <ul className="mt-1 space-y-1 text-emerald-900 dark:text-emerald-100">
                      {item.correctOptionIds.map((id) => (
                        <li key={id}>{optionLabel(item, id)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 italic text-slate-500 dark:text-slate-400">Not available</p>
                  )}
                </div>
              </div>

              {item.explanation && (
                <p className="mt-3 rounded-xl border border-slate-200 p-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-white">Why: </span>
                  {item.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

export default ResultDetailPage;
