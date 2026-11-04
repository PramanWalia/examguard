import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import {
  ImportModal,
  QuestionFormModal,
  QuestionRow,
} from '../components/questions/QuestionModals';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState } from '../components/States';
import {
  Badge,
  ConfirmDialog,
  Input,
  PageHeader,
  Pagination,
  Select,
} from '../components/ui';
import { DIFFICULTIES, QUESTION_TYPES } from '../utils/constants';
import { getApiError } from '../utils/errors';

export const QuestionsPage = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    q: '',
    subject: '',
    topic: '',
    difficulty: '',
    type: '',
  });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const debouncedQuery = useDebouncedValue(filters.q, 300);

  const query = useQuery({
    queryKey: ['questions', { ...filters, q: debouncedQuery, page }],
    queryFn: async () => {
      const response = await apiClient.get('/questions', {
        params: {
          page,
          limit: 10,
          ...(debouncedQuery ? { q: debouncedQuery } : {}),
          ...(filters.subject ? { subject: filters.subject } : {}),
          ...(filters.topic ? { topic: filters.topic } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          ...(filters.type ? { type: filters.type } : {}),
        },
      });
      return { rows: unwrap(response) || [], meta: unwrapMeta(response) || {} };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (question) => {
      await apiClient.delete(`/questions/${question.id}`);
      return question;
    },
    onSuccess: async () => {
      toast.success('Question deleted.');
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const facets = query.data?.meta?.facets || { subjects: [], topics: [] };
  const rows = query.data?.rows || [];
  const meta = query.data?.meta;
  const hasFilters = useMemo(
    () =>
      Boolean(
        filters.subject ||
          filters.topic ||
          filters.difficulty ||
          filters.type ||
          debouncedQuery,
      ),
    [filters, debouncedQuery],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (question) => {
    setEditing(question);
    setFormOpen(true);
  };

  return (
    <section>
      <PageHeader
        actions={
          <>
            <button className="btn-secondary" onClick={() => setImportOpen(true)} type="button">
              Import CSV
            </button>
            <button className="btn-primary" onClick={openCreate} type="button">
              <span aria-hidden="true">＋</span> New question
            </button>
          </>
        }
        description="Search, filter, and maintain the questions you can reuse in any exam."
        kicker="Teacher"
        title="Question bank"
      />

      <div className="card mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <div>
            <label className="label" htmlFor="question-search">
              Search
            </label>
            <Input
              id="question-search"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, q: event.target.value }));
              }}
              placeholder="Search prompt text…"
              type="search"
              value={filters.q}
            />
          </div>
          <div>
            <label className="label" htmlFor="question-subject">
              Subject
            </label>
            <Select
              id="question-subject"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({
                  ...current,
                  subject: event.target.value,
                  topic: '',
                }));
              }}
              value={filters.subject}
            >
              <option value="">All subjects</option>
              {facets.subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-topic">
              Topic
            </label>
            <Select
              id="question-topic"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, topic: event.target.value }));
              }}
              value={filters.topic}
            >
              <option value="">All topics</option>
              {facets.topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-difficulty">
              Difficulty
            </label>
            <Select
              id="question-difficulty"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, difficulty: event.target.value }));
              }}
              value={filters.difficulty}
            >
              <option value="">Any</option>
              {DIFFICULTIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-type">
              Type
            </label>
            <Select
              id="question-type"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, type: event.target.value }));
              }}
              value={filters.type}
            >
              <option value="">Any</option>
              {QUESTION_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {hasFilters && (
          <button
            className="btn-ghost btn-sm mt-3"
            onClick={() => {
              setFilters({ q: '', subject: '', topic: '', difficulty: '', type: '' });
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
        <EmptyState
          action={
            <button className="btn-primary btn-sm" onClick={openCreate} type="button">
              Create a question
            </button>
          }
          icon="▤"
          message={
            hasFilters
              ? 'No questions match these filters. Try clearing them.'
              : 'Your reusable questions will appear here.'
          }
          title={hasFilters ? 'No matching questions' : 'Your question bank is empty'}
        />
      )}

      {rows.length > 0 && (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="table-wrap sm:mx-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Type</th>
                    <th>Difficulty</th>
                    <th>Marks</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((question) => (
                    <QuestionRow
                      key={question.id}
                      onDelete={setDeleting}
                      onEdit={openEdit}
                      question={question}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((question) => (
              <article className="card p-4" key={question.id}>
                <p className="font-medium text-slate-900 dark:text-slate-100">{question.prompt}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {question.subject} · {question.topic}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="slate">{question.type.replaceAll('_', ' ')}</Badge>
                  <Badge
                    tone={
                      question.difficulty === 'easy'
                        ? 'green'
                        : question.difficulty === 'hard'
                          ? 'red'
                          : 'amber'
                    }
                  >
                    {question.difficulty}
                  </Badge>
                  <Badge tone="brand">{question.defaultMarks} marks</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => openEdit(question)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="btn-ghost btn-sm text-red-600 dark:text-red-400"
                    onClick={() => setDeleting(question)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>

          <Pagination label="questions" meta={meta} onPageChange={setPage} />
        </>
      )}

      {formOpen && (
        <QuestionFormModal
          key={editing?.id || 'new'}
          onClose={() => setFormOpen(false)}
          open={formOpen}
          question={editing}
        />
      )}

      <ImportModal onClose={() => setImportOpen(false)} open={importOpen} />

      <ConfirmDialog
        busy={deleteMutation.isPending}
        confirmLabel="Delete question"
        danger
        message="Deleting a question does not change exams that already published a snapshot of it. This cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutate(deleting)}
        open={Boolean(deleting)}
        title="Delete this question?"
      />
    </section>
  );
};

export default QuestionsPage;
