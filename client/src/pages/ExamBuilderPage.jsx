import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ErrorState, InlineError, LoadingState } from '../components/States';
import { Badge, Field, Input, PageHeader, Select, Textarea, Toggle } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { FALLBACK_BATCHES, QUESTION_TYPES, RESULT_MODES } from '../utils/constants';
import { getApiError, getFieldErrors } from '../utils/errors';
import { cn } from '../utils/cn';
import { formatDuration, fromDateTimeLocal, toDateTimeLocal } from '../utils/format';

const steps = [
  { id: 1, label: 'Details' },
  { id: 2, label: 'Rules' },
  { id: 3, label: 'Audience' },
  { id: 4, label: 'Questions' },
  { id: 5, label: 'Review' },
];

const detailsSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(150, 'Title is too long.'),
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
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid start time.', path: ['startAt'] });
    }
    if (Number.isNaN(end.getTime())) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid end time.', path: ['endAt'] });
    }
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start >= end) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after the start time.', path: ['endAt'] });
      }
      if (end <= new Date()) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be in the future.', path: ['endAt'] });
      }
    }
  });

const createDefaults = () => {
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

const SortableQuestion = ({ item, index, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.questionId });
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
          {item.subject} · {QUESTION_TYPES.find((type) => type.value === item.type)?.label || item.type}
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

const QuestionPicker = ({ selectedIds, onAdd }) => {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const query = useQuery({
    queryKey: ['questions', 'picker', q],
    queryFn: async () => {
      const response = await apiClient.get('/questions', { params: { limit: 50, ...(q ? { q } : {}) } });
      return unwrap(response) || [];
    },
  });

  return (
    <div className="card p-4">
      <label className="label" htmlFor="picker-search">Add from question bank</label>
      <Input
        id="picker-search"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by prompt…"
        type="search"
        value={search}
      />
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {query.isPending && <div className="skeleton h-24" />}
        {query.isError && <ErrorState compact message={getApiError(query.error).message} onRetry={query.refetch} />}
        {query.isSuccess && query.data.length === 0 && (
          <p className="p-3 text-center text-sm text-slate-500 dark:text-slate-400">
            No questions found. <Link className="link" to="/questions">Create one first</Link>.
          </p>
        )}
        {(query.data || []).map((question) => {
          const added = selectedIds.includes(question.id);
          return (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800" key={question.id}>
              <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{question.prompt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{question.subject}</span>
                <span>·</span>
                <span>{question.topic}</span>
                <Badge tone="slate">{question.difficulty}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{question.defaultMarks} marks</span>
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

export const ExamBuilderPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isEdit = Boolean(examId);
  const [step, setStep] = useState(1);
  const [items, setItems] = useState([]);
  const [batchIds, setBatchIds] = useState([]);
  const [joinCodeEnabled, setJoinCodeEnabled] = useState(true);
  const [serverError, setServerError] = useState('');
  const [loadedExamId, setLoadedExamId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const examQuery = useQuery({
    queryKey: ['exam', examId],
    queryFn: async () => {
      const response = await apiClient.get(`/exams/${examId}`);
      return unwrap(response);
    },
    enabled: isEdit,
  });
  const publishedEdit = isEdit && examQuery.data?.status === 'published';

  const batchesQuery = useQuery({
    queryKey: ['exam-batches'],
    queryFn: async () => {
      const response = await apiClient.get('/exams', { params: { limit: 1 } });
      return unwrapMeta(response)?.batches || [];
    },
    staleTime: 5 * 60_000,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    getValues,
    formState: { errors },
  } = useForm({ defaultValues: createDefaults(), resolver: zodResolver(detailsSchema), mode: 'onBlur' });

  const settings = watch('settings');
  const resultMode = watch('resultMode');
  const title = watch('title');

  useEffect(() => {
    if (!isEdit || !examQuery.data || loadedExamId === examQuery.data.id) return;
    const exam = examQuery.data;
    reset({
      title: exam.title,
      description: exam.description || '',
      durationMinutes: exam.durationMinutes,
      startAt: toDateTimeLocal(exam.startAt),
      endAt: toDateTimeLocal(exam.endAt),
      resultMode: exam.resultMode || 'after_end',
      settings: {
        shuffleQuestions: exam.settings?.shuffleQuestions ?? true,
        shuffleOptions: exam.settings?.shuffleOptions ?? true,
        passPercentage: exam.settings?.passPercentage ?? 40,
        violationLimit: exam.settings?.violationLimit ?? 3,
        autoSubmitOnViolation: exam.settings?.autoSubmitOnViolation ?? true,
      },
    });
    setBatchIds(exam.assignment?.batchIds || []);
    setJoinCodeEnabled(exam.assignment?.joinCodeEnabled ?? true);
    setItems(
      (exam.items || []).map((item) => ({
        questionId: item.questionId,
        marks: item.marks,
        negativeMarks: item.negativeMarks,
        prompt: item.questionSnapshot?.prompt || 'Question snapshot available after publish',
        subject: item.questionSnapshot?.subject || '',
        type: item.questionSnapshot?.type || 'single_choice',
      })),
    );
    setLoadedExamId(exam.id);
  }, [examId, examQuery.data, isEdit, loadedExamId, navigate, reset]);

  const batchOptions = useMemo(() => {
    const meta = batchesQuery.data;
    return meta?.length ? meta : FALLBACK_BATCHES;
  }, [batchesQuery.data]);

  const addQuestion = (question) => {
    setItems((current) => [
      ...current,
      {
        questionId: question.id,
        marks: question.defaultMarks,
        negativeMarks: question.negativeMarks,
        prompt: question.prompt,
        subject: question.subject,
        type: question.type,
      },
    ]);
  };

  const removeQuestion = (questionId) => setItems((current) => current.filter((item) => item.questionId !== questionId));
  const updateMarks = (questionId, field, value) =>
    setItems((current) =>
      current.map((item) => (item.questionId === questionId ? { ...item, [field]: Math.max(0, Number(value) || 0) } : item)),
    );

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setItems((current) => {
      const from = current.findIndex((item) => item.questionId === active.id);
      const to = current.findIndex((item) => item.questionId === over.id);
      return arrayMove(current, from, to);
    });
  };

  const toggleBatch = (batchId) =>
    setBatchIds((current) =>
      current.includes(batchId) ? current.filter((id) => id !== batchId) : [...current, batchId],
    );

  const mutation = useMutation({
    mutationFn: async ({ publish }) => {
      const values = getValues();
      if (publishedEdit) {
        const response = await apiClient.patch(`/exams/${examId}`, {
          startAt: fromDateTimeLocal(values.startAt),
          endAt: fromDateTimeLocal(values.endAt),
        });
        return { exam: unwrap(response), publish: false };
      }
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || '',
        durationMinutes: Number(values.durationMinutes),
        startAt: fromDateTimeLocal(values.startAt),
        endAt: fromDateTimeLocal(values.endAt),
        resultMode: values.resultMode,
        settings: {
          ...values.settings,
          passPercentage: Number(values.settings.passPercentage),
          violationLimit: Number(values.settings.violationLimit),
        },
        assignment: { batchIds, joinCodeEnabled },
        items: items.map((item) => ({
          questionId: item.questionId,
          marks: Number(item.marks),
          negativeMarks: Number(item.negativeMarks),
        })),
      };
      const response = isEdit
        ? await apiClient.patch(`/exams/${examId}`, payload)
        : await apiClient.post('/exams', payload);
      const exam = unwrap(response);
      if (publish) {
        await apiClient.post(`/exams/${exam.id}/publish`);
      }
      return { exam, publish };
    },
    onSuccess: async ({ exam, publish }) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      await queryClient.invalidateQueries({ queryKey: ['exam', exam.id] });
      toast.success(publish ? 'Exam published. Students can now see it in their window.' : 'Draft saved.');
      navigate(`/exams/${exam.id}`, { replace: true });
    },
    onError: (error) => {
      const fieldErrors = getFieldErrors(error);
      const apiError = getApiError(error);
      setServerError(
        Object.keys(fieldErrors).length
          ? Object.values(fieldErrors).join(' ')
          : apiError.message,
      );
      toast.error(apiError.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const save = async (publish) => {
    setServerError('');
    if (publish && items.length === 0) {
      setServerError('Add at least one question before publishing.');
      setStep(4);
      return;
    }
    const valid = await trigger();
    if (!valid) {
      setStep(1);
      setServerError('Some details still need attention. Fix the highlighted fields and save again.');
      return;
    }
    mutation.mutate({ publish });
  };

  const next = async () => {
    setServerError('');
    if (step === 1) {
      const valid = await trigger(['title', 'description', 'durationMinutes', 'startAt', 'endAt', 'resultMode']);
      if (!valid) return;
    }
    setStep((value) => Math.min(5, value + 1));
  };

  if (isEdit && examQuery.isPending) return <LoadingState label="Loading exam draft" />;
  if (isEdit && examQuery.isError) {
    return <ErrorState message={getApiError(examQuery.error).message} onRetry={examQuery.refetch} />;
  }

  const totalMarks = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);

  if (publishedEdit) {
    return (
      <section>
        <PageHeader
          actions={<Link className="btn-secondary" to={`/exams/${examId}`}>Cancel</Link>}
          description="Change when students can access this published exam."
          kicker="Edit schedule"
          title={title || 'Exam schedule'}
        />
        {serverError && <div className="mb-4"><InlineError>{serverError}</InlineError></div>}
        <form
          className="panel max-w-2xl space-y-5"
          noValidate
          onSubmit={handleSubmit(() => mutation.mutate({ publish: false }))}
        >
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Exam date and time</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Set a new opening and closing time. The closing time must be after the opening time and in the future.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={errors.startAt?.message} htmlFor="exam-start" label="Opens" required>
              <Input id="exam-start" type="datetime-local" {...register('startAt')} />
            </Field>
            <Field error={errors.endAt?.message} htmlFor="exam-end" label="Closes" required>
              <Input id="exam-end" type="datetime-local" {...register('endAt')} />
            </Field>
          </div>
          <button className="btn-primary" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Saving…' : 'Save date and time'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        actions={
          <Link className="btn-secondary" to={isEdit ? `/exams/${examId}` : '/exams'}>
            Cancel
          </Link>
        }
        description={
          isEdit
            ? 'Update the draft, then publish when the schedule and rules are final.'
            : 'Build a draft in five steps. Nothing is visible to students until you publish.'
        }
        kicker={isEdit ? 'Edit draft' : 'New exam'}
        title={isEdit ? title || 'Exam draft' : 'Build an exam'}
      />

      <ol className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        {steps.map((item) => {
          const state = step === item.id ? 'current' : step > item.id ? 'done' : 'todo';
          return (
            <li className="flex-1" key={item.id}>
              <button
                className={cn(
                  'flex w-full min-h-10 items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-semibold transition-colors sm:text-sm',
                  state === 'current' && 'bg-brand-600 text-white',
                  state === 'done' && 'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-200 dark:hover:bg-brand-950',
                  state === 'todo' && 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
                onClick={() => setStep(item.id)}
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

      {serverError && <div className="mb-4"><InlineError>{serverError}</InlineError></div>}

      <form
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"
        noValidate
        onSubmit={handleSubmit(() => mutation.mutate({ publish: false }))}
      >
        <div className="min-w-0">
          {step === 1 && (
            <div className="panel space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Exam details</h2>
              <Field error={errors.title?.message} htmlFor="exam-title" label="Title" required>
                <Input id="exam-title" placeholder="Advanced Algorithms — Midterm" {...register('title')} />
              </Field>
              <Field error={errors.description?.message} htmlFor="exam-description" label="Description" hint="Shown to students before they start.">
                <Textarea id="exam-description" placeholder="What the exam covers and anything students should bring." rows={3} {...register('description')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field error={errors.durationMinutes?.message} htmlFor="exam-duration" label="Duration (minutes)" required>
                  <Input id="exam-duration" min="1" max="480" type="number" {...register('durationMinutes')} />
                </Field>
                <Field error={errors.startAt?.message} htmlFor="exam-start" label="Window starts" required>
                  <Input id="exam-start" type="datetime-local" {...register('startAt')} />
                </Field>
                <Field error={errors.endAt?.message} htmlFor="exam-end" label="Window ends" required>
                  <Input id="exam-end" type="datetime-local" {...register('endAt')} />
                </Field>
              </div>
              <Field htmlFor="exam-result-mode" label="Release results" hint="Students never see results before the API releases them.">
                <Select id="exam-result-mode" {...register('resultMode')} value={resultMode}>
                  {RESULT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="panel space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Attempt rules</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle
                  checked={settings.shuffleQuestions}
                  description="Each student sees a different order."
                  label="Shuffle questions"
                  onChange={(value) => setValue('settings.shuffleQuestions', value)}
                />
                <Toggle
                  checked={settings.shuffleOptions}
                  description="Option order is randomized per attempt."
                  label="Shuffle options"
                  onChange={(value) => setValue('settings.shuffleOptions', value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field error={errors.settings?.passPercentage?.message} htmlFor="exam-pass" label="Pass percentage">
                  <Input id="exam-pass" max="100" min="0" type="number" {...register('settings.passPercentage')} />
                </Field>
                <Field
                  error={errors.settings?.violationLimit?.message}
                  hint="0 disables auto-submit."
                  htmlFor="exam-violations"
                  label="Violation limit"
                >
                  <Input id="exam-violations" max="1000" min="0" type="number" {...register('settings.violationLimit')} />
                </Field>
              </div>
              <Toggle
                checked={settings.autoSubmitOnViolation}
                description="Submit automatically when the limit is reached. The client also shows warnings."
                label="Auto-submit at the violation limit"
                onChange={(value) => setValue('settings.autoSubmitOnViolation', value)}
              />
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                Proctoring signals are a deterrent and an audit trail, not a security boundary. The server still owns expiry and submission.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="panel space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Audience</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Choose the batches that can see this exam on their dashboard.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {batchOptions.map((batch) => (
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition-colors',
                      batchIds.includes(batch.id)
                        ? 'border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-100'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    )}
                    key={batch.id}
                  >
                    <input
                      checked={batchIds.includes(batch.id)}
                      className="h-4 w-4 accent-brand-600"
                      onChange={() => toggleBatch(batch.id)}
                      type="checkbox"
                    />
                    {batch.name}
                  </label>
                ))}
              </div>
              {batchIds.length === 0 && (
                <p className="field-error">Select at least one batch, or students can only enter with a join code.</p>
              )}
              <Toggle
                checked={joinCodeEnabled}
                description="Students outside these batches can join with the generated code."
                label="Allow join code access"
                onChange={setJoinCodeEnabled}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <QuestionPicker onAdd={addQuestion} selectedIds={items.map((item) => item.questionId)} />

                <div className="card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-slate-950 dark:text-white">Selected questions</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{items.length} items · {totalMarks} marks</p>
                    </div>
                    {items.length > 0 && (
                      <button className="btn-ghost btn-sm" onClick={() => setItems([])} type="button">
                        Clear all
                      </button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Add questions from the bank. Drag the handle to reorder before publishing.
                    </p>
                  ) : (
                    <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
                      <SortableContext items={items.map((item) => item.questionId)} strategy={verticalListSortingStrategy}>
                        <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {items.map((item, index) => (
                            <SortableQuestion
                              index={index}
                              item={{
                                ...item,
                                onMarksChange: (value) => updateMarks(item.questionId, 'marks', value),
                                onNegativeChange: (value) => updateMarks(item.questionId, 'negativeMarks', value),
                              }}
                              key={item.questionId}
                              onRemove={removeQuestion}
                            />
                          ))}
                        </ol>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="panel">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Review before you publish</h2>
              <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  ['Title', title || 'Untitled exam'],
                  ['Duration', formatDuration(watch('durationMinutes'))],
                  ['Window', `${watch('startAt').replace('T', ' ')} → ${watch('endAt').replace('T', ' ')}`],
                  ['Questions', `${items.length} (${totalMarks} marks)`],
                  ['Audience', joinCodeEnabled ? `${batchIds.length} batch(es) + join code` : `${batchIds.length} batch(es)`],
                  ['Violation limit', settings.violationLimit ? `${settings.violationLimit} signals` : 'Disabled'],
                  ['Results', RESULT_MODES.find((mode) => mode.value === resultMode)?.label || resultMode],
                ].map(([label, value]) => (
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={label}>
                    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Publishing freezes a snapshot of every question. Later edits to the question bank will not change this exam.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="panel">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Draft status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {items.length} questions · {totalMarks} marks
            </p>
            <div className="mt-3 grid gap-2">
              <button className="btn-secondary w-full" disabled={mutation.isPending} onClick={() => save(false)} type="button">
                {mutation.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn-primary w-full" disabled={mutation.isPending} onClick={() => save(true)} type="button">
                {mutation.isPending ? 'Working…' : isEdit ? 'Save and publish' : 'Publish exam'}
              </button>
            </div>
            <div className="mt-3 flex justify-between gap-2">
              <button className="btn-ghost btn-sm" disabled={step === 1} onClick={() => setStep((value) => value - 1)} type="button">
                ← Back
              </button>
              <button className="btn-ghost btn-sm" disabled={step === 5} onClick={next} type="button">
                Next →
              </button>
            </div>
          </div>
          <p className="px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Signed in as {user?.name}. Draft saves are private until publish.
          </p>
        </aside>
      </form>
    </section>
  );
};

export default ExamBuilderPage;
