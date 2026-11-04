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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import {
  createDefaults,
  detailsSchema,
  ExamReviewPanel,
  ExamStepNav,
  QuestionPicker,
  SortableQuestion,
} from '../components/examBuilder/ExamBuilderWidgets';
import { ErrorState, InlineError, LoadingState } from '../components/States';
import { Field, Input, PageHeader, Select, Textarea, Toggle } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { FALLBACK_BATCHES, RESULT_MODES } from '../utils/constants';
import { getApiError, getFieldErrors } from '../utils/errors';
import { cn } from '../utils/cn';
import { fromDateTimeLocal, toDateTimeLocal } from '../utils/format';

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
  } = useForm({
    defaultValues: createDefaults(),
    resolver: zodResolver(detailsSchema),
    mode: 'onBlur',
  });

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

  const removeQuestion = (questionId) =>
    setItems((current) => current.filter((item) => item.questionId !== questionId));

  const updateMarks = (questionId, field, value) =>
    setItems((current) =>
      current.map((item) =>
        item.questionId === questionId
          ? { ...item, [field]: Math.max(0, Number(value) || 0) }
          : item,
      ),
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
      current.includes(batchId)
        ? current.filter((id) => id !== batchId)
        : [...current, batchId],
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
      toast.success(
        publish
          ? 'Exam published. Students can now see it in their window.'
          : 'Draft saved.',
      );
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
      setServerError(
        'Some details still need attention. Fix the highlighted fields and save again.',
      );
      return;
    }
    mutation.mutate({ publish });
  };

  const next = async () => {
    setServerError('');
    if (step === 1) {
      const valid = await trigger([
        'title',
        'description',
        'durationMinutes',
        'startAt',
        'endAt',
        'resultMode',
      ]);
      if (!valid) return;
    }
    setStep((value) => Math.min(5, value + 1));
  };

  if (isEdit && examQuery.isPending) return <LoadingState label="Loading exam draft" />;
  if (isEdit && examQuery.isError) {
    return (
      <ErrorState
        message={getApiError(examQuery.error).message}
        onRetry={examQuery.refetch}
      />
    );
  }

  const totalMarks = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);

  if (publishedEdit) {
    return (
      <section>
        <PageHeader
          actions={
            <Link className="btn-secondary" to={`/exams/${examId}`}>
              Cancel
            </Link>
          }
          description="Change when students can access this published exam."
          kicker="Edit schedule"
          title={title || 'Exam schedule'}
        />
        {serverError && (
          <div className="mb-4">
            <InlineError>{serverError}</InlineError>
          </div>
        )}
        <form
          className="panel max-w-2xl space-y-5"
          noValidate
          onSubmit={handleSubmit(() => mutation.mutate({ publish: false }))}
        >
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">
              Exam date and time
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Set a new opening and closing time. The closing time must be after the opening time
              and in the future.
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

      <ExamStepNav onSelectStep={setStep} step={step} />

      {serverError && (
        <div className="mb-4">
          <InlineError>{serverError}</InlineError>
        </div>
      )}

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
                <Input
                  id="exam-title"
                  placeholder="Advanced Algorithms — Midterm"
                  {...register('title')}
                />
              </Field>
              <Field
                error={errors.description?.message}
                hint="Shown to students before they start."
                htmlFor="exam-description"
                label="Description"
              >
                <Textarea
                  id="exam-description"
                  placeholder="What the exam covers and anything students should bring."
                  rows={3}
                  {...register('description')}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  error={errors.durationMinutes?.message}
                  htmlFor="exam-duration"
                  label="Duration (minutes)"
                  required
                >
                  <Input
                    id="exam-duration"
                    max="480"
                    min="1"
                    type="number"
                    {...register('durationMinutes')}
                  />
                </Field>
                <Field
                  error={errors.startAt?.message}
                  htmlFor="exam-start"
                  label="Window starts"
                  required
                >
                  <Input id="exam-start" type="datetime-local" {...register('startAt')} />
                </Field>
                <Field
                  error={errors.endAt?.message}
                  htmlFor="exam-end"
                  label="Window ends"
                  required
                >
                  <Input id="exam-end" type="datetime-local" {...register('endAt')} />
                </Field>
              </div>
              <Field
                hint="Students never see results before the API releases them."
                htmlFor="exam-result-mode"
                label="Release results"
              >
                <Select id="exam-result-mode" {...register('resultMode')} value={resultMode}>
                  {RESULT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
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
                <Field
                  error={errors.settings?.passPercentage?.message}
                  htmlFor="exam-pass"
                  label="Pass percentage"
                >
                  <Input
                    id="exam-pass"
                    max="100"
                    min="0"
                    type="number"
                    {...register('settings.passPercentage')}
                  />
                </Field>
                <Field
                  error={errors.settings?.violationLimit?.message}
                  hint="0 disables auto-submit."
                  htmlFor="exam-violations"
                  label="Violation limit"
                >
                  <Input
                    id="exam-violations"
                    max="1000"
                    min="0"
                    type="number"
                    {...register('settings.violationLimit')}
                  />
                </Field>
              </div>
              <Toggle
                checked={settings.autoSubmitOnViolation}
                description="Submit automatically when the limit is reached. The client also shows warnings."
                label="Auto-submit at the violation limit"
                onChange={(value) => setValue('settings.autoSubmitOnViolation', value)}
              />
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                Both browser proctoring events and server-side anomaly signals (missed heartbeats,
                long answer gaps, IP/user-agent changes) are recorded in the teacher audit trail.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="panel space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Audience</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Choose the batches that can see this exam on their dashboard.
              </p>
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
                <p className="field-error">
                  Select at least one batch, or students can only enter with a join code.
                </p>
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
                <QuestionPicker
                  onAdd={addQuestion}
                  selectedIds={items.map((item) => item.questionId)}
                />

                <div className="card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-slate-950 dark:text-white">
                        Selected questions
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {items.length} items · {totalMarks} marks
                      </p>
                    </div>
                    {items.length > 0 && (
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setItems([])}
                        type="button"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Add questions from the bank. Drag the handle to reorder before publishing.
                    </p>
                  ) : (
                    <DndContext
                      collisionDetection={closestCenter}
                      onDragEnd={onDragEnd}
                      sensors={sensors}
                    >
                      <SortableContext
                        items={items.map((item) => item.questionId)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {items.map((item, index) => (
                            <SortableQuestion
                              index={index}
                              item={{
                                ...item,
                                onMarksChange: (value) =>
                                  updateMarks(item.questionId, 'marks', value),
                                onNegativeChange: (value) =>
                                  updateMarks(item.questionId, 'negativeMarks', value),
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
            <ExamReviewPanel
              batchCount={batchIds.length}
              durationMinutes={watch('durationMinutes')}
              endAt={watch('endAt')}
              itemCount={items.length}
              joinCodeEnabled={joinCodeEnabled}
              resultMode={resultMode}
              startAt={watch('startAt')}
              title={title}
              totalMarks={totalMarks}
              violationLimit={settings.violationLimit}
            />
          )}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="panel">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Draft status
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {items.length} questions · {totalMarks} marks
            </p>
            <div className="mt-3 grid gap-2">
              <button
                className="btn-secondary w-full"
                disabled={mutation.isPending}
                onClick={() => save(false)}
                type="button"
              >
                {mutation.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button
                className="btn-primary w-full"
                disabled={mutation.isPending}
                onClick={() => save(true)}
                type="button"
              >
                {mutation.isPending
                  ? 'Working…'
                  : isEdit
                    ? 'Save and publish'
                    : 'Publish exam'}
              </button>
            </div>
            <div className="mt-3 flex justify-between gap-2">
              <button
                className="btn-ghost btn-sm"
                disabled={step === 1}
                onClick={() => setStep((value) => value - 1)}
                type="button"
              >
                ← Back
              </button>
              <button
                className="btn-ghost btn-sm"
                disabled={step === 5}
                onClick={next}
                type="button"
              >
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
