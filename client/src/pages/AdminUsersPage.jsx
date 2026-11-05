import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState } from '../components/States';
import {
  Avatar,
  Badge,
  ConfirmDialog,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatCard,
} from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getApiError } from '../utils/errors';

export const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [filters, setFilters] = useState({ q: '', role: '', batch: '', isActive: '' });
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const q = useDebouncedValue(filters.q, 300);

  const query = useQuery({
    queryKey: ['admin-users', { ...filters, q, page }],
    queryFn: async () => {
      const response = await apiClient.get('/users', {
        params: {
          page,
          limit: 15,
          ...(q ? { q } : {}),
          ...(filters.role ? { role: filters.role } : {}),
          ...(filters.batch ? { batch: filters.batch } : {}),
          ...(filters.isActive ? { isActive: filters.isActive } : {}),
        },
      });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }) => {
      const response = await apiClient.patch(`/users/${id}`, patch);
      return unwrap(response);
    },
    onSuccess: async () => {
      toast.success('User updated.');
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-exams', 'dashboard'] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const remove = useMutation({
    mutationFn: async (id) => {
      const response = await apiClient.delete(`/users/${id}`);
      return unwrap(response);
    },
    onSuccess: async () => {
      toast.success('User deleted.');
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-exams', 'dashboard'] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const rows = query.data?.rows || [];
  const meta = query.data?.meta;
  const summary = meta?.summary || {};
  const batches = meta?.batches || [];

  const setFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section>
      <PageHeader
        description="Search accounts, approve pending teacher registrations, and manage role or batch access."
        kicker="Admin"
        title="Users"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          hint={`${summary.roleCounts?.student ?? 0} students`}
          label="Total users"
          value={query.isPending ? '—' : summary.total ?? 0}
        />
        <StatCard
          hint="Can sign in"
          label="Active"
          value={query.isPending ? '—' : summary.active ?? 0}
        />
        <StatCard
          hint={
            summary.pendingTeachers
              ? `${summary.pendingTeachers} awaiting approval`
              : 'Can author exams'
          }
          label="Teachers"
          value={query.isPending ? '—' : summary.roleCounts?.teacher ?? 0}
        />
        <StatCard
          hint="Disabled or pending"
          label="Inactive"
          value={query.isPending ? '—' : summary.inactive ?? 0}
        />
      </div>

      <div className="card mt-5 mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <label className="label" htmlFor="user-search">
              Search
            </label>
            <Input
              id="user-search"
              onChange={(event) => setFilter('q', event.target.value)}
              placeholder="Name or email…"
              type="search"
              value={filters.q}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-role">
              Role
            </label>
            <Select
              id="user-role"
              onChange={(event) => setFilter('role', event.target.value)}
              value={filters.role}
            >
              <option value="">All roles</option>
              <option value="admin">Admins</option>
              <option value="teacher">Teachers</option>
              <option value="student">Students</option>
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="user-batch">
              Batch
            </label>
            <Select
              id="user-batch"
              onChange={(event) => setFilter('batch', event.target.value)}
              value={filters.batch}
            >
              <option value="">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="user-status">
              Status
            </label>
            <Select
              id="user-status"
              onChange={(event) => setFilter('isActive', event.target.value)}
              value={filters.isActive}
            >
              <option value="">Any status</option>
              <option value="true">Active</option>
              <option value="false">Inactive / Pending</option>
            </Select>
          </div>
        </div>
        {(filters.q || filters.role || filters.batch || filters.isActive) && (
          <button
            className="btn-ghost btn-sm mt-3"
            onClick={() => {
              setFilters({ q: '', role: '', batch: '', isActive: '' });
              setPage(1);
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {query.isPending && <div className="skeleton h-72" />}
      {query.isError && (
        <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />
      )}
      {query.isSuccess && rows.length === 0 && (
        <EmptyState icon="☷" message="No accounts match these filters." title="No users found" />
      )}

      {rows.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Batches</th>
                    <th>Status</th>
                    <th className="text-right">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    const isPendingTeacher =
                      !user.isActive &&
                      (user.approvalStatus === 'pending' || user.role === 'teacher');
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={user.name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">
                                {user.name}
                                {isSelf && (
                                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                                    (you)
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isSelf ? (
                            <Badge tone="brand">admin</Badge>
                          ) : (
                            <Select
                              aria-label={`Role for ${user.name}`}
                              className="h-9 w-28 px-2 py-1 text-xs"
                              disabled={update.isPending}
                              onChange={(event) =>
                                update.mutate({
                                  id: user.id,
                                  patch: { role: event.target.value },
                                })
                              }
                              value={user.role}
                            >
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Admin</option>
                            </Select>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(user.batchIds || []).length === 0 && (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                            {(user.batchIds || []).map((batch) => (
                              <Badge key={batch} tone="slate">
                                {batch}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td>
                          {user.isActive ? (
                            <Badge tone="green">Active</Badge>
                          ) : isPendingTeacher ? (
                            <Badge tone="amber">Pending approval</Badge>
                          ) : (
                            <Badge tone="red">Inactive</Badge>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            {isPendingTeacher && (
                              <button
                                className="btn-sm rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                                disabled={update.isPending}
                                onClick={() => {
                                  update.mutate(
                                    { id: user.id, patch: { isActive: true } },
                                    {
                                      onSuccess: () => toast.success(`Teacher ${user.name} approved!`),
                                    },
                                  );
                                }}
                                type="button"
                              >
                                Approve Teacher
                              </button>
                            )}
                            {user.role !== 'admin' && (
                              <button
                                aria-checked={user.isActive}
                                aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                                className={`switch-track disabled:cursor-not-allowed disabled:opacity-50 ${
                                  user.isActive
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-700'
                                }`}
                                disabled={update.isPending || remove.isPending}
                                onClick={() =>
                                  update.mutate({
                                    id: user.id,
                                    patch: { isActive: !user.isActive },
                                  })
                                }
                                role="switch"
                                type="button"
                              >
                                <span
                                  className={`switch-thumb ${
                                    user.isActive ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            )}
                            {!isSelf && (
                              <button
                                className="btn-danger btn-sm ml-1"
                                disabled={update.isPending || remove.isPending}
                                onClick={() => setDeleteTarget(user)}
                                type="button"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination label="users" meta={meta} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        busy={remove.isPending}
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete user'}
        danger
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}'s account (${deleteTarget.email}) permanently?`
            : ''
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        open={Boolean(deleteTarget)}
        title="Delete user account?"
      />
    </section>
  );
};

export default AdminUsersPage;
