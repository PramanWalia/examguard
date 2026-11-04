import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Modal } from '../ui';
import { useCountdown } from '../../hooks/useCountdown';
import { cn } from '../../utils/cn';
import { formatDateTime, formatSeconds } from '../../utils/format';

export const isAnswerFilled = (answer) => {
  if (!answer) return false;
  if (
    answer.numericValue !== null &&
    answer.numericValue !== undefined &&
    answer.numericValue !== ''
  ) {
    return true;
  }
  return (answer.selectedOptionIds || []).length > 0;
};

export const AttemptTimer = ({ expiresAt, onExpire, enabled }) => {
  const { remainingSeconds, warning } = useCountdown(expiresAt, { enabled, onExpire });
  const tone =
    remainingSeconds <= 60 ? 'is-critical' : remainingSeconds <= 300 ? 'is-warning' : '';

  return (
    <div className="flex items-center gap-2">
      <span
        aria-label={`Time remaining ${formatSeconds(remainingSeconds)}`}
        className={cn('attempt-timer', tone)}
      >
        {formatSeconds(remainingSeconds)}
      </span>
      <span
        aria-live="polite"
        className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold sm:text-amber-700 sm:dark:text-amber-300"
      >
        {warning}
      </span>
    </div>
  );
};

export const QuestionPalette = ({
  questions,
  answers,
  currentIndex,
  onSelect,
  className,
}) => {
  const counts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    questions.forEach((item) => {
      const answer = answers[item.id];
      if (isAnswerFilled(answer)) answered += 1;
      if (answer?.markedForReview) marked += 1;
    });
    return { answered, marked, unanswered: questions.length - answered };
  }, [questions, answers]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Question palette</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {counts.answered}/{questions.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((item, index) => {
          const answer = answers[item.id];
          const answered = isAnswerFilled(answer);
          const marked = Boolean(answer?.markedForReview);
          return (
            <button
              aria-current={index === currentIndex ? 'step' : undefined}
              aria-label={`Question ${index + 1}${answered ? ', answered' : ', unanswered'}${marked ? ', marked for review' : ''}`}
              className={cn(
                'palette-cell',
                marked
                  ? 'palette-marked'
                  : answered
                    ? 'palette-answered'
                    : 'palette-unanswered',
                index === currentIndex && 'palette-current',
              )}
              key={item.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-600" /> Answered {counts.answered}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-slate-400" /> Unanswered{' '}
          {counts.unanswered}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-700" /> Marked{' '}
          {counts.marked}
        </span>
      </div>
    </div>
  );
};

export const NumericAnswerInput = ({ itemId, value, onChange }) => {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [itemId, value]);

  return (
    <div className="mt-4 max-w-sm">
      <label className="label" htmlFor={`numeric-${itemId}`}>
        Your answer
      </label>
      <input
        className="input text-lg tabular-nums"
        id={`numeric-${itemId}`}
        inputMode="decimal"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === '' || next === '-' || next === '.') {
            onChange(null);
            return;
          }
          const parsed = Number(next);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        placeholder="Enter a number"
        type="text"
        value={draft}
      />
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Negative values are allowed where the question calls for them.
      </p>
    </div>
  );
};

export const SaveIndicator = ({ status, pendingCount, onRetry }) => {
  const meta = {
    saved: { dot: 'bg-emerald-500', label: pendingCount ? 'Saving soon…' : 'All changes saved' },
    saving: { dot: 'bg-brand-500 animate-pulse', label: 'Saving…' },
    offline: { dot: 'bg-amber-500 animate-pulse', label: `Offline · ${pendingCount} queued` },
    error: { dot: 'bg-red-500', label: 'Save failed' },
  }[status] || { dot: 'bg-slate-400', label: 'Not saved yet' };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', meta.dot)} />
      {meta.label}
      {status === 'error' && (
        <button
          className="font-semibold text-red-600 underline dark:text-red-400"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      )}
    </span>
  );
};

export const AttemptQuestionCard = ({
  currentItem,
  currentIndex,
  totalQuestions,
  answer,
  onNumericChange,
  onChooseOption,
  onToggleMark,
  onClearAnswer,
}) => (
  <article className="card p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
          Question {currentIndex + 1} of {totalQuestions}
        </span>
        <Badge tone="slate">{currentItem.marks} marks</Badge>
        {currentItem.negativeMarks > 0 && (
          <Badge tone="red">−{currentItem.negativeMarks}</Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {currentItem.question.subject && (
          <Badge tone="brand">{currentItem.question.subject}</Badge>
        )}
        <Badge tone="slate">{currentItem.question.type.replaceAll('_', ' ')}</Badge>
      </div>
    </div>

    <h1 className="question-text mt-4 font-semibold">{currentItem.question.prompt}</h1>

    {currentItem.question.type === 'numeric' ? (
      <NumericAnswerInput
        itemId={currentItem.id}
        onChange={onNumericChange}
        value={answer.numericValue}
      />
    ) : (
      <fieldset className="mt-5 space-y-2.5">
        <legend className="sr-only">Answer choices</legend>
        {currentItem.question.type === 'multiple_choice' && (
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Select all that apply.
          </p>
        )}
        {currentItem.question.options.map((option, index) => {
          const selected = (answer.selectedOptionIds || []).includes(option.id);
          return (
            <label
              className={cn(
                'option-row',
                selected && 'border-brand-500 bg-brand-50 dark:bg-brand-950/40',
              )}
              key={option.id}
            >
              <input
                checked={selected}
                name={`question-${currentItem.id}`}
                onChange={() => onChooseOption(option.id)}
                type={currentItem.question.type === 'single_choice' ? 'radio' : 'checkbox'}
              />
              <span className="min-w-0">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm leading-6 text-slate-800 dark:text-slate-200">
                  {option.text}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    )}

    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap gap-2">
        <button
          className={
            answer.markedForReview
              ? 'btn-secondary btn-sm border-amber-400 text-amber-800 dark:text-amber-300'
              : 'btn-secondary btn-sm'
          }
          onClick={onToggleMark}
          type="button"
        >
          {answer.markedForReview ? '★ Marked for review' : '☆ Mark for review'}
        </button>
        {isAnswerFilled(answer) && (
          <button className="btn-ghost btn-sm" onClick={onClearAnswer} type="button">
            Clear response
          </button>
        )}
      </div>
      <span className="hidden text-xs text-slate-400 sm:block">
        <span className="kbd">←</span> <span className="kbd">→</span> navigate ·{' '}
        <span className="kbd">1–6</span> choose · <span className="kbd">M</span> mark
      </span>
    </div>
  </article>
);

export const SubmittedAttemptView = ({ attemptId, finalSummary }) => (
  <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-4 dark:bg-slate-950">
    <section className="card w-full max-w-lg p-7 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">Attempt submitted</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
        {finalSummary.submittedAt ? `Submitted ${formatDateTime(finalSummary.submittedAt)}. ` : ''}
        Your answers are final and safely stored on the server.
      </p>
      <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        {finalSummary.resultAvailable
          ? 'Your result is available now.'
          : finalSummary.resultReleaseAt
            ? `Results are expected after ${formatDateTime(finalSummary.resultReleaseAt)}.`
            : 'Your teacher will release results when the exam window closes.'}
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {finalSummary.resultAvailable && (
          <Link className="btn-primary" to={`/attempts/${attemptId}/result`}>
            View result
          </Link>
        )}
        <Link
          className={finalSummary.resultAvailable ? 'btn-secondary' : 'btn-primary'}
          to="/dashboard"
        >
          Back to dashboard
        </Link>
      </div>
    </section>
  </main>
);

export const SubmitAttemptModal = ({
  open,
  onClose,
  onSubmit,
  isPending,
  answeredCount,
  unanswered,
  markedCount,
  remainingSeconds,
}) => (
  <Modal
    description="Submission is final. You cannot change answers after this."
    footer={
      <>
        <button className="btn-secondary" onClick={onClose} type="button">
          Keep working
        </button>
        <button className="btn-primary" disabled={isPending} onClick={onSubmit} type="button">
          {isPending ? 'Submitting…' : 'Submit attempt'}
        </button>
      </>
    }
    onClose={onClose}
    open={open}
    size="sm"
    title="Submit this attempt?"
  >
    <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
      <p className="flex justify-between py-0.5">
        <span className="text-slate-600 dark:text-slate-400">Answered</span>
        <strong>{answeredCount}</strong>
      </p>
      <p className="flex justify-between py-0.5">
        <span className="text-slate-600 dark:text-slate-400">Unanswered</span>
        <strong>{unanswered}</strong>
      </p>
      <p className="flex justify-between py-0.5">
        <span className="text-slate-600 dark:text-slate-400">Marked for review</span>
        <strong>{markedCount}</strong>
      </p>
    </div>
    {unanswered > 0 && (
      <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
        {unanswered} question{unanswered === 1 ? '' : 's'} will be submitted without an answer.
      </p>
    )}
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      Remaining server time: {formatSeconds(remainingSeconds)}. Unsynced changes are sent before
      submission.
    </p>
  </Modal>
);

export const ProctoringWarningModal = ({ warning, onDismiss }) => (
  <Modal
    description="This event was sent to your teacher for review."
    footer={
      <button className="btn-primary" onClick={onDismiss} type="button">
        Continue attempt
      </button>
    }
    onClose={onDismiss}
    open={Boolean(warning) && !warning?.pending}
    size="sm"
    title="Proctoring signal recorded"
  >
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>
        Signal: <strong>{warning?.type?.replaceAll('_', ' ')}</strong>
      </p>
      <p className="mt-1">
        Total recorded: <strong>{warning?.count}</strong>
        {warning?.max > 0 ? ` of ${warning.max}` : ''}
      </p>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
      Stay on this tab and keep the exam in fullscreen. Reaching the violation limit may submit
      your attempt automatically.
    </p>
  </Modal>
);

