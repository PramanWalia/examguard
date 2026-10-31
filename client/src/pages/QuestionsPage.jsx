import { memo, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import toast from 'react-hot-toast';

import apiClient, { unwrap, unwrapMeta } from '../api/client';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState, InlineError } from '../components/States';
import {
  Badge,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '../components/ui';
import { getApiError, getFieldErrors } from '../utils/errors';
import { DIFFICULTIES, QUESTION_TYPES } from '../utils/constants';
import { formatDate } from '../utils/format';

const optionIds = ['a', 'b', 'c', 'd', 'e', 'f'];

const blankQuestion = {
  subject: '',
  topic: '',
  difficulty: 'medium',
  type: 'single_choice',
  prompt: '',
  explanation: '',
  defaultMarks: 1,
  negativeMarks: 0,
  options: [
    { id: 'a', text: '' },
    { id: 'b', text: '' },
    { id: 'c', text: '' },
    { id: 'd', text: '' },
  ],
  correctOptionIds: [],
  numericAnswer: '',
};

const toFormValues = (question) =>
  question
    ? {
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        type: question.type,
        prompt: question.prompt,
        explanation: question.explanation || '',
        defaultMarks: question.defaultMarks,
        negativeMarks: question.negativeMarks,
        options: question.options?.length
          ? question.options.map((option) => ({ ...option }))
          : blankQuestion.options,
        correctOptionIds: question.correctOptionIds || [],
        numericAnswer: question.numericAnswer ?? '',
      }
    : blankQuestion;

const questionSchema = z
  .object({
    subject: z.string().trim().min(1, 'Subject is required.').max(80, 'Subject is too long.'),
    topic: z.string().trim().min(1, 'Topic is required.').max(80, 'Topic is too long.'),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    type: z.enum(['single_choice', 'multiple_choice', 'numeric']),
    prompt: z.string().trim().min(5, 'Prompt must be at least 5 characters.').max(2000, 'Prompt is too long.'),
    explanation: z.string().trim().max(2000, 'Explanation is too long.').optional(),
    defaultMarks: z.coerce.number().min(0, 'Marks cannot be negative.').max(100, 'Marks max is 100.'),
    negativeMarks: z.coerce.number().min(0, 'Negative marks cannot be negative.').max(100, 'Negative marks max is 100.'),
    options: z.array(z.object({ id: z.string(), text: z.string() })),
    correctOptionIds: z.array(z.string()),
    numericAnswer: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (values.negativeMarks > values.defaultMarks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Negative marks cannot exceed the question marks.',
        path: ['negativeMarks'],
      });
    }
    if (values.type === 'numeric') {
      const numeric = Number(values.numericAnswer);
      if (values.numericAnswer === '' || !Number.isFinite(numeric)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter the correct numeric answer.',
          path: ['numericAnswer'],
        });
      }
      return;
    }
    const filled = values.options.filter((option) => option.text.trim());
    if (filled.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least two options with text.',
        path: ['options'],
      });
    }
    if (values.correctOptionIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at least one correct option.',
        path: ['correctOptionIds'],
      });
    }
    if (values.type === 'single_choice' && values.correctOptionIds.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Single choice needs exactly one correct option.',
        path: ['correctOptionIds'],
      });
    }
    values.correctOptionIds.forEach((id) => {
      if (!values.options.some((option) => option.id === id && option.text.trim())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Correct options must reference an option with text.',
          path: ['correctOptionIds'],
        });
      }
    });
  });

const QuestionFormModal = ({ open, onClose, question }) => {
  const queryClient = useQueryClient();
  const isEdit = Boolean(question?.id);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: toFormValues(question),
    resolver: zodResolver(questionSchema),
    mode: 'onBlur',
  });
  const { fields, append, remove } = useFieldArray({ control, keyName: 'key', name: 'options' });
  const type = watch('type');
  const correctOptionIds = watch('correctOptionIds') || [];
  const options = watch('options') || [];

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit) {
        const response = await apiClient.patch(`/questions/${question.id}`, payload);
        return unwrap(response);
      }
      const response = await apiClient.post('/questions', payload);
      return unwrap(response);
    },
    onSuccess: async () => {
      toast.success(isEdit ? 'Question updated.' : 'Question created.');
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      reset(blankQuestion);
      onClose();
    },
    onError: (error) => {
      const fieldErrors = getFieldErrors(error);
      if (Object.keys(fieldErrors).length === 0) {
        setServerError(getApiError(error).message);
        return;
      }
      const firstMessage = Object.values(fieldErrors)[0];
      setServerError(String(firstMessage));
    },
  });

  const changeType = (nextType) => {
    setValue('type', nextType);
    if (nextType === 'numeric') {
      setValue('correctOptionIds', []);
    } else if (fields.length < 2) {
      setValue('options', blankQuestion.options);
    }
  };

  const toggleCorrect = (optionId) => {
    if (type === 'single_choice') {
      setValue('correctOptionIds', [optionId], { shouldValidate: true });
      return;
    }
    setValue(
      'correctOptionIds',
      correctOptionIds.includes(optionId)
        ? correctOptionIds.filter((id) => id !== optionId)
        : [...correctOptionIds, optionId],
      { shouldValidate: true },
    );
  };

  const removeOption = (index) => {
    const option = fields[index];
    remove(index);
    setValue(
      'correctOptionIds',
      correctOptionIds.filter((id) => id !== option.id),
    );
  };

  const nextOptionId = () => optionIds.find((id) => !fields.some((field) => field.id === id)) || optionIds[0];

  const onSubmit = (values) => {
    setServerError('');
    mutation.mutate({
      subject: values.subject.trim(),
      topic: values.topic.trim(),
      difficulty: values.difficulty,
      type: values.type,
      prompt: values.prompt.trim(),
      options:
        values.type === 'numeric'
          ? []
          : values.options
              .filter((option) => option.text.trim())
              .map((option) => ({ id: option.id, text: option.text.trim() })),
      correctOptionIds: values.type === 'numeric' ? [] : values.correctOptionIds,
      numericAnswer: values.type === 'numeric' ? Number(values.numericAnswer) : null,
      explanation: values.explanation?.trim() || '',
      defaultMarks: Number(values.defaultMarks),
      negativeMarks: Number(values.negativeMarks),
    });
  };

  return (
    <Modal
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-primary" disabled={mutation.isPending} form="question-form" type="submit">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save question' : 'Create question'}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={isEdit ? 'Edit question' : 'Create question'}
      description="Question content, marks, and answer keys are stored on the server."
    >
      <form className="space-y-4" id="question-form" noValidate onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={errors.subject?.message} htmlFor="q-subject" label="Subject">
            <Input id="q-subject" placeholder="Mathematics" {...register('subject')} />
          </Field>
          <Field error={errors.topic?.message} htmlFor="q-topic" label="Topic">
            <Input id="q-topic" placeholder="Algebra" {...register('topic')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field error={errors.type?.message} htmlFor="q-type" label="Question type">
            <Select id="q-type" onChange={(event) => changeType(event.target.value)} value={type}>
              {QUESTION_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field error={errors.difficulty?.message} htmlFor="q-difficulty" label="Difficulty">
            <Select id="q-difficulty" {...register('difficulty')}>
              {DIFFICULTIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field error={errors.defaultMarks?.message} htmlFor="q-marks" label="Marks">
              <Input id="q-marks" min="0" step="0.5" type="number" {...register('defaultMarks')} />
            </Field>
            <Field error={errors.negativeMarks?.message} htmlFor="q-negative" label="Negative">
              <Input id="q-negative" min="0" step="0.5" type="number" {...register('negativeMarks')} />
            </Field>
          </div>
        </div>

        <Field error={errors.prompt?.message} htmlFor="q-prompt" label="Prompt">
          <Textarea id="q-prompt" placeholder="Write the question exactly as students should see it." rows={3} {...register('prompt')} />
        </Field>

        {type === 'numeric' ? (
          <Field
            error={errors.numericAnswer?.message}
            hint="Grading compares this number with the student's answer."
            htmlFor="q-numeric"
            label="Correct numeric answer"
          >
            <Input id="q-numeric" step="any" type="number" {...register('numericAnswer')} />
          </Field>
        ) : (
          <fieldset>
            <div className="mb-2 flex items-center justify-between gap-2">
              <legend className="label mb-0">Options</legend>
              <button
                className="btn-secondary btn-sm"
                disabled={fields.length >= 6}
                onClick={() => append({ id: nextOptionId(), text: '' })}
                type="button"
              >
                Add option
              </button>
            </div>
            {errors.options?.message && <p className="field-error mb-2">{errors.options.message}</p>}
            {errors.correctOptionIds?.message && <p className="field-error mb-2">{errors.correctOptionIds.message}</p>}
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div className="flex items-start gap-2" key={field.key}>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <input
                      checked={correctOptionIds.includes(field.id)}
                      className="h-4 w-4 accent-brand-600"
                      name="correct-option"
                      onChange={() => toggleCorrect(field.id)}
                      type={type === 'single_choice' ? 'radio' : 'checkbox'}
                    />
                    <span className="font-mono uppercase">{field.id}</span>
                  </label>
                  <Input placeholder={`Option ${field.id.toUpperCase()}`} {...register(`options.${index}.text`)} />
                  <button
                    aria-label={`Remove option ${field.id}`}
                    className="btn-ghost btn-sm mt-0.5 shrink-0"
                    disabled={fields.length <= 2}
                    onClick={() => removeOption(index)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Tick the correct {type === 'single_choice' ? 'option' : 'options'}.
            </p>
          </fieldset>
        )}

        <Field error={errors.explanation?.message} htmlFor="q-explanation" label="Explanation (optional)">
          <Textarea
            id="q-explanation"
            placeholder="Shown to students only after results are released."
            rows={2}
            {...register('explanation')}
          />
        </Field>

        {serverError && <InlineError>{serverError}</InlineError>}
      </form>
    </Modal>
  );
};

const QuestionRow = memo(function QuestionRow({ question, onEdit, onDelete }) {
  return (
    <tr>
      <td className="min-w-[18rem]">
        <p className="line-clamp-2 font-medium text-slate-900 dark:text-slate-100">{question.prompt}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {question.subject} · {question.topic} · updated {formatDate(question.updatedAt)}
        </p>
      </td>
      <td>
        <Badge tone="slate">{QUESTION_TYPES.find((item) => item.value === question.type)?.label || question.type}</Badge>
      </td>
      <td>
        <Badge tone={question.difficulty === 'easy' ? 'green' : question.difficulty === 'hard' ? 'red' : 'amber'}>
          {question.difficulty}
        </Badge>
      </td>
      <td className="whitespace-nowrap">
        <span className="font-semibold text-slate-900 dark:text-white">{question.defaultMarks}</span>
        {question.negativeMarks > 0 && <span className="text-xs text-red-600 dark:text-red-400"> / −{question.negativeMarks}</span>}
      </td>
      <td>
        <div className="flex justify-end gap-1">
          <button className="btn-ghost btn-sm" onClick={() => onEdit(question)} type="button">
            Edit
          </button>
          <button className="btn-ghost btn-sm text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => onDelete(question)} type="button">
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

const ImportModal = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (selectedFile) => {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await apiClient.post('/questions/import', formData);
      return unwrap(response);
    },
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(`Imported ${data.createdCount} question${data.createdCount === 1 ? '' : 's'}.`);
    },
    onError: (requestError) => setError(getApiError(requestError).message),
  });

  const downloadTemplate = () => {
    const header = 'subject,topic,difficulty,type,prompt,optionA,optionB,optionC,optionD,correctOptions,numericAnswer,explanation,defaultMarks,negativeMarks';
    const rows = [
      'Mathematics,Algebra,easy,single_choice,"What is 2 + 2?",3,4,5,6,a,,Basic addition,1,0',
      'Mathematics,Algebra,medium,numeric,"What is 7 × 6?",,,,,,42,,Times table,1,0',
    ];
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'examguard-question-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const close = () => {
    setFile(null);
    setResult(null);
    setError('');
    onClose();
  };

  return (
    <Modal
      footer={
        <>
          <button className="btn-secondary" onClick={close} type="button">
            {result ? 'Done' : 'Cancel'}
          </button>
          <button className="btn-primary" disabled={!file || mutation.isPending} onClick={() => mutation.mutate(file)} type="button">
            {mutation.isPending ? 'Importing…' : 'Import questions'}
          </button>
        </>
      }
      onClose={close}
      open={open}
      title="Import questions"
      description="Upload a CSV or XLSX file. Every valid row is imported; invalid rows are reported."
    >
      <div className="space-y-4">
        <button className="btn-secondary btn-sm" onClick={downloadTemplate} type="button">
          Download CSV template
        </button>

        <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-600 dark:hover:bg-brand-950/20">
          <span aria-hidden="true" className="text-2xl">⇪</span>
          <span className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
            {file ? file.name : 'Choose a CSV or XLSX file'}
          </span>
          <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maximum 5 MB</span>
          <input
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(event) => {
              setResult(null);
              setError('');
              setFile(event.target.files?.[0] || null);
            }}
            ref={inputRef}
            type="file"
          />
        </label>

        {error && <InlineError>{error}</InlineError>}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Created</p>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{result.createdCount}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/30">
                <p className="text-xs font-semibold uppercase text-red-700 dark:text-red-300">Failed</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100">{result.failedCount}</p>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                {result.errors.map((rowError) => (
                  <li className="rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/30" key={rowError.row}>
                    <p className="font-semibold text-red-800 dark:text-red-300">Row {rowError.row}: {rowError.message}</p>
                    {rowError.details?.length > 0 && (
                      <p className="mt-0.5 text-red-700 dark:text-red-400">
                        {rowError.details.map((detail) => detail.message).join(' ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export const QuestionsPage = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', subject: '', topic: '', difficulty: '', type: '' });
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
    onSuccess: async (question) => {
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
    () => Boolean(filters.subject || filters.topic || filters.difficulty || filters.type || debouncedQuery),
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
              Import
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
            <label className="label" htmlFor="question-search">Search</label>
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
            <label className="label" htmlFor="question-subject">Subject</label>
            <Select
              id="question-subject"
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, subject: event.target.value, topic: '' }));
              }}
              value={filters.subject}
            >
              <option value="">All subjects</option>
              {facets.subjects.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-topic">Topic</label>
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
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-difficulty">Difficulty</label>
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
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="question-type">Type</label>
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
                <option key={item.value} value={item.value}>{item.label}</option>
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
      {query.isError && <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />}

      {query.isSuccess && rows.length === 0 && (
        <EmptyState
          action={
            <button className="btn-primary btn-sm" onClick={openCreate} type="button">
              Create a question
            </button>
          }
          icon="▤"
          message={hasFilters ? 'No questions match these filters. Try clearing them.' : 'Your reusable questions will appear here.'}
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
                    <QuestionRow key={question.id} onDelete={setDeleting} onEdit={openEdit} question={question} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((question) => (
              <article className="card p-4" key={question.id}>
                <p className="font-medium text-slate-900 dark:text-slate-100">{question.prompt}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{question.subject} · {question.topic}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="slate">{question.type.replaceAll('_', ' ')}</Badge>
                  <Badge tone={question.difficulty === 'easy' ? 'green' : question.difficulty === 'hard' ? 'red' : 'amber'}>{question.difficulty}</Badge>
                  <Badge tone="brand">{question.defaultMarks} marks</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => openEdit(question)} type="button">Edit</button>
                  <button className="btn-ghost btn-sm text-red-600 dark:text-red-400" onClick={() => setDeleting(question)} type="button">Delete</button>
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
