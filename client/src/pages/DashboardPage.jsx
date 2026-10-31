import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { StudentExamsPanel } from '../components/StudentExamsPanel';
import { EmptyState, ErrorState } from '../components/States';
import { Avatar, Badge, PageHeader, StatCard } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatDuration, phaseMeta, statusMeta } from '../utils/format';

const TeacherDashboard = ({ user }) => {
  const query = useQuery({
    queryKey: ['teacher-exams', 'dashboard'],
    queryFn: async () => {
      const response = await apiClient.get('/exams', { params: { limit: 100 } });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const rows = query.data?.rows || [];
  const summary = query.data?.meta?.summary || {};
  const live = rows.filter((exam) => exam.phase === 'live');
  const upcoming = rows.filter((exam) => exam.phase === 'upcoming');
  const recent = rows.slice(0, 5);

  return (
    <section>
      <PageHeader
        actions={
          <>
            <Link className="btn-secondary" to="/questions">
              Question bank
            </Link>
            <Link className="btn-primary" to="/exams/new">
              <span aria-hidden="true">＋</span> New exam
            </Link>
          </>
        }
        description={`Good to see you, ${user?.name?.split(' ')[0] || 'teacher'}. Here is what is happening across your assessments.`}
        kicker="Teacher workspace"
        title="Overview"
      />

      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint="Scheduled and running" label="Live now" value={query.isPending ? '—' : summary.live ?? live.length} />
        <StatCard hint="Published in the future" label="Upcoming" value={query.isPending ? '—' : summary.upcoming ?? upcoming.length} />
        <StatCard hint="Across all your exams" label="Published" value={query.isPending ? '—' : summary.published ?? 0} />
        <StatCard hint="Saved but unpublished" label="Drafts" value={query.isPending ? '—' : summary.draft ?? 0} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Recent exams</h2>
            <Link className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" to="/exams">
              View all
            </Link>
          </div>

          {query.isPending && <div className="skeleton h-64" />}
          {query.isSuccess && recent.length === 0 && (
            <EmptyState
              action={
                <Link className="btn-primary btn-sm" to="/exams/new">
                  Build your first exam
                </Link>
              }
              icon="▣"
              message="Create a draft, add questions from your bank, then publish when the timing is right."
              title="No exams yet"
            />
          )}

          {recent.length > 0 && (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {recent.map((exam) => {
                const phase = phaseMeta(exam.phase);
                return (
                  <Link
                    className="block p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:p-5"
                    key={exam.id}
                    to={`/exams/${exam.id}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-950 dark:text-white">{exam.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge tone={exam.status === 'draft' ? 'slate' : 'brand'}>{statusMeta(exam.status).label}</Badge>
                        <Badge tone={phase.tone}>{phase.label}</Badge>
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(exam.startAt)} · {formatDuration(exam.durationMinutes)} · {exam.itemCount ?? 0} questions
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live right now</h2>
            {query.isPending && <div className="skeleton mt-3 h-20" />}
            {query.isSuccess && live.length === 0 && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No exam is currently running.</p>
            )}
            <div className="mt-3 space-y-3">
              {live.map((exam) => (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30" key={exam.id}>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{exam.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Ends {formatDateTime(exam.endAt)}</p>
                  <div className="mt-2 flex gap-2">
                    <Link className="btn-secondary btn-sm" to={`/exams/${exam.id}/monitor`}>
                      Monitor
                    </Link>
                    <Link className="btn-ghost btn-sm" to={`/exams/${exam.id}`}>
                      Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick actions</h2>
            <div className="mt-3 grid gap-2">
              <Link className="btn-secondary justify-start" to="/questions">
                Browse the question bank
              </Link>
              <Link className="btn-secondary justify-start" to="/exams/new">
                Build a new exam
              </Link>
              <Link className="btn-secondary justify-start" to="/exams">
                Manage exam schedule
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

const AdminDashboard = () => {
  const usersQuery = useQuery({
    queryKey: ['admin-users', 'dashboard'],
    queryFn: async () => {
      const response = await apiClient.get('/users', { params: { limit: 5 } });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });
  const examsQuery = useQuery({
    queryKey: ['admin-exams', 'dashboard'],
    queryFn: async () => {
      const response = await apiClient.get('/exams', { params: { limit: 1 } });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const summary = usersQuery.data?.meta?.summary || {};
  const examSummary = examsQuery.data?.meta?.summary || {};

  return (
    <section>
      <PageHeader
        actions={
          <Link className="btn-primary" to="/users">
            Manage users
          </Link>
        }
        description="Platform-wide accounts and assessment activity."
        kicker="Admin workspace"
        title="Platform overview"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard hint={`${summary.roleCounts?.student ?? 0} students`} label="Total users" value={usersQuery.isPending ? '—' : summary.total ?? 0} />
        <StatCard hint="Can sign in today" label="Active accounts" value={usersQuery.isPending ? '—' : summary.active ?? 0} />
        <StatCard hint="Created by teachers" label="Exams" value={examsQuery.isPending ? '—' : examSummary.total ?? 0} />
        <StatCard hint="Currently running" label="Live exams" value={examsQuery.isPending ? '—' : examSummary.live ?? 0} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Newest accounts</h2>
            <Link className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" to="/users">
              View all
            </Link>
          </div>
          {usersQuery.isPending && <div className="skeleton h-48" />}
          {usersQuery.isError && <ErrorState compact message={getApiError(usersQuery.error).message} onRetry={usersQuery.refetch} />}
          {usersQuery.isSuccess && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(usersQuery.data.rows || []).map((user) => (
                <li className="flex items-center gap-3 py-3" key={user.id}>
                  <Avatar name={user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>
                  <Badge tone={user.role === 'admin' ? 'brand' : user.role === 'teacher' ? 'amber' : 'slate'}>{user.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Exam health</h2>
          <dl className="mt-4 space-y-4">
            {[
              ['Published', examSummary.published ?? 0],
              ['Upcoming', examSummary.upcoming ?? 0],
              ['Live', examSummary.live ?? 0],
              ['Ended', examSummary.ended ?? 0],
            ].map(([label, value]) => (
              <div className="flex items-center justify-between gap-3" key={label}>
                <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
                <dd className="text-lg font-bold text-slate-950 dark:text-white">{examsQuery.isPending ? '—' : value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
            Admin accounts can inspect results but cannot change a student’s answers. Toggle an account under Users to revoke access immediately.
          </p>
        </div>
      </div>
    </section>
  );
};

export const DashboardPage = () => {
  const user = useAuthStore((state) => state.user);
  if (user?.role === 'student') return <StudentExamsPanel />;
  if (user?.role === 'admin') return <AdminDashboard />;
  return <TeacherDashboard user={user} />;
};

export default DashboardPage;
