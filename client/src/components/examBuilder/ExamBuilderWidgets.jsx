import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import apiClient, { unwrap } from '../../api/client';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ErrorState } from '../States';
import { Badge, Input } from '../ui';
import { QUESTION_TYPES, RESULT_MODES } from '../../utils/constants';
import { getApiError } from '../../utils/errors';
import { cn } from '../../utils/cn';
import { formatDuration, toDateTimeLocal } from '../../utils/format';

export const steps = [
  { id: 1, label: 'Details' },
  { id: 2, label: 'Rules' },
  { id: 3, label: 'Audience' },
  { id: 4, label: 'Questions' },
  { id: 5, label: 'Review' },
];

export const detailsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Title must be at least 3 characters.')
      .max(150, 'Title is too long.'),
    description: z.string().max(2000, 'Description is too long.').optional(),
    durationMinutes: z.coerce
      .number()
      .int('Use whole minutes.')
      .min(1, 'Duration must be at least 1 minute.')
      .max(480, 'Duration cannot exceed 480 minutes.'),
    startAt: z.string().min(1, 'Choose a start time.'),
    endAt: z.string().min(1, 'Choose an end time.'),
    resultMode: z.enum(['immediate', 'after_end', 'manual']),
    settings: z.object({
      shuffleQuestions: z.boolean(),
      shuffleOptions: z.boolean(),
      passPercentage: z.coerce.number().min(0).max(100),
      violationLimit: z.coerce.number().int().min(0).max(1000),
      autoSubmitOnViolation: z.boolean(),
    }),
  })
  .superRefine((values, context) => {
    const start = new Date(values.startAt);
    const end = new Date(values.endAt);
    if (Number.isNaN(start.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid start time.',
        path: ['startAt'],
      });
    }
    if (Number.isNaN(end.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid end time.',
        path: ['endAt'],
      });
    }
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start >= end) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time must be after the start time.',
          path: ['endAt'],
        });
      }
      if (end <= new Date()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time must be in the future.',
          path: ['endAt'],
        });
      }
    }
  });

export const createDefaults = () => {
  const now = Date.now();
  return {
    title: '',
    description: '',
    durationMinutes: 60,
    startAt: toDateTimeLocal(new Date(now + 60 * 60 * 1000)),
    endAt: toDateTimeLocal(new Date(now + 25 * 60 * 60 * 1000)),
    resultMode: 'after_end',
    settings: {
      shuffleQuestions: true,
      shuffleOptions: true,
      passPercentage: 40,
      violationLimit: 3,
      autoSubmitOnViolation: true,
    },
  };
};

export const SortableQuestion = ({ item, index, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.questionId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900',
        isDragging && 'relative z-10 shadow-xl ring-2 ring-brand-400',
      )}
      ref={setNodeRef}
      style={style}
    >
      <button
        aria-label={`Reorder question ${index + 1}`}
        className="mt-0.5 cursor-grab touch-none rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-200"
        type="button"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          <span className="mr-1.5 text-xs font-bold text-slate-400">{index + 1}.</span>
          {item.prompt}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {item.subject} ·{' '}
          {QUESTION_TYPES.find((type) => type.value === item.type)?.label || item.type}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            Marks
            <input
              className="input h-8 w-16 px-2 py-1 text-xs"
              min="0"
              onChange={(event) => item.onMarksChange(Number(event.target.value))}
              step="0.5"
              type="number"
              value={item.marks}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            Negative
            <input
              className="input h-8 w-16 px-2 py-1 text-xs"
              min="0"
              onChange={(event) => item.onNegativeChange(Number(event.target.value))}
              step="0.5"
              type="number"
              value={item.negativeMarks}
            />
          </label>
        </div>
      </div>
      <button
        aria-label={`Remove question ${index + 1}`}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        onClick={() => onRemove(item.questionId)}
        type="button"
      >
        ✕
      </button>
    </li>
  );
};

export const QuestionPicker = ({ selectedIds, onAdd }) => {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const query = useQuery({
    queryKey: ['questions', 'picker', q],
    queryFn: async () => {
      const response = await apiClient.get('/questions', {
        params: { limit: 50, ...(q ? { q } : {}) },
      });
      return unwrap(response) || [];
    },
  });

  return (
    <div className="card p-4">
      <label className="label" htmlFor="picker-search">
        Add from question bank
      </label>
      <Input
        id="picker-search"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by prompt…"
        type="search"
        value={search}
      />
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {query.isPending && <div className="skeleton h-24" />}
        {query.isError && (
          <ErrorState
            compact
            message={getApiError(query.error).message}
            onRetry={query.refetch}
          />
        )}
        {query.isSuccess && query.data.length === 0 && (
          <p className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">
            No questions found.{' '}
            <Link className="link" to="/questions">
              Create one first
            </Link>
            .
          </p>
        )}
        {(query.data || []).map((question) => {
          const added = selectedIds.includes(question.id);
          return (
            <div
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              key={question.id}
            >
              <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {question.prompt}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{question.subject}</span>
                <span>·</span>
                <span>{question.topic}</span>
                <Badge tone="slate">{question.difficulty}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {question.defaultMarks} marks
                </span>
                <button
                  className={added ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                  disabled={added}
                  onClick={() => onAdd(question)}
                  type="button"
                >
                  {added ? 'Added' : 'Add'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ExamStepNav = ({ step, onSelectStep }) => (
  <ol className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
    {steps.map((item) => {
      const state = step === item.id ? 'current' : step > item.id ? 'done' : 'todo';
      return (
        <li className="flex-1" key={item.id}>
          <button
            className={cn(
              'flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:text-sm',
              state === 'current' && 'bg-brand-600 text-white',
              state === 'done' &&
                'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-200 dark:hover:bg-brand-950',
              state === 'todo' &&
                'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
            onClick={() => onSelectStep(item.id)}
            type="button"
          >
            <span
              className={cn(
                'grid h-5 w-5 place-items-center rounded-full text-[10px]',
                state === 'current' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700',
              )}
            >
              {state === 'done' ? '✓' : item.id}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        </li>
      );
    })}
  </ol>
);

export const ExamReviewPanel = ({
  title,
  durationMinutes,
  startAt,
  endAt,
  itemCount,
  totalMarks,
  batchCount,
  joinCodeEnabled,
  violationLimit,
  resultMode,
}) => (
  <div className="panel">
    <h2 className="text-lg font-bold text-slate-950 dark:text-white">Review before you publish</h2>
    <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
      {[
        ['Title', title || 'Untitled exam'],
        ['Duration', formatDuration(durationMinutes)],
        ['Window', `${(startAt || '').replace('T', ' ')} → ${(endAt || '').replace('T', ' ')}`],
        ['Questions', `${itemCount} (${totalMarks} marks)`],
        [
          'Audience',
          joinCodeEnabled ? `${batchCount} batch(es) + join code` : `${batchCount} batch(es)`,
        ],
        ['Violation limit', violationLimit ? `${violationLimit} signals` : 'Disabled'],
        ['Results', RESULT_MODES.find((mode) => mode.value === resultMode)?.label || resultMode],
      ].map(([label, value]) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
          key={label}
        >
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="font-semibold text-slate-900 dark:text-white">{value}</dd>
        </div>
      ))}
    </dl>
    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      Publishing freezes a snapshot of every question. Later edits to the question bank will not
      change this exam.
    </p>
  </div>
);
