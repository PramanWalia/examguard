import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap } from '../api/client';
import { ConnectivityBanner } from '../components/ConnectivityBanner';
import { ErrorState, LoadingState } from '../components/States';
import { Badge, Modal } from '../components/ui';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { useAutosave } from '../hooks/useAutosave';
import { useCountdown } from '../hooks/useCountdown';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { useAttemptStore } from '../store/attemptStore';
import { useClockStore } from '../store/clockStore';
import { cn } from '../utils/cn';
import { getApiError } from '../utils/errors';
import { formatDateTime, formatSeconds } from '../utils/format';

const isAnswerFilled = (answer) => {
  if (!answer) return false;
  if (answer.numericValue !== null && answer.numericValue !== undefined && answer.numericValue !== '') return true;
  return (answer.selectedOptionIds || []).length > 0;
};

export const AttemptTimer = ({ expiresAt, onExpire, enabled }) => {
  const { remainingSeconds, warning } = useCountdown(expiresAt, { enabled, onExpire });
  const tone = remainingSeconds <= 60 ? 'is-critical' : remainingSeconds <= 300 ? 'is-warning' : '';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('attempt-timer', tone)} aria-label={`Time remaining ${formatSeconds(remainingSeconds)}`}>
        {formatSeconds(remainingSeconds)}
      </span>
      <span aria-live="polite" className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold sm:text-amber-700 sm:dark:text-amber-300">
        {warning}
      </span>
    </div>
  );
};

export const QuestionPalette = ({ questions, answers, currentIndex, onSelect, className }) => {
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
        <span className="text-xs text-slate-500 dark:text-slate-400">{counts.answered}/{questions.length}</span>
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
                marked ? 'palette-marked' : answered ? 'palette-answered' : 'palette-unanswered',
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
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand-600" /> Answered {counts.answered}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-400" /> Unanswered {counts.unanswered}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-700" /> Marked {counts.marked}</span>
      </div>
    </div>
  );
};

const NumericAnswerInput = ({ itemId, value, onChange }) => {
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
  }, [itemId, value]);

  return (
    <div className="mt-4 max-w-sm">
      <label className="label" htmlFor={`numeric-${itemId}`}>Your answer</label>
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
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Negative values are allowed where the question calls for them.</p>
    </div>
  );
};

const SaveIndicator = ({ status, pendingCount, onRetry }) => {
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
        <button className="font-semibold text-red-600 underline dark:text-red-400" onClick={onRetry} type="button">
          Retry
        </button>
      )}
    </span>
  );
};

export const AttemptPage = () => {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clock = useClockStore((state) => state.now);
  const [questionSheetOpen, setQuestionSheetOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [hydratedAttemptId, setHydratedAttemptId] = useState(null);
  const expiryHandledRef = useRef(false);
  const submittingRef = useRef(false);

  const answers = useAttemptStore((state) => state.answers);
  const currentIndex = useAttemptStore((state) => state.currentIndex);
  const setCurrentIndex = useAttemptStore((state) => state.setCurrentIndex);
  const setAnswer = useAttemptStore((state) => state.setAnswer);
  const toggleMark = useAttemptStore((state) => state.toggleMark);
  const clearAnswer = useAttemptStore((state) => state.clearAnswer);
  const hydrate = useAttemptStore((state) => state.hydrate);

  const query = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      const response = await apiClient.get(`/attempts/${attemptId}`);
      return unwrap(response);
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const data = query.data;
  const activeAttempt = data?.status === 'in_progress' ? data : null;
  const ready = Boolean(activeAttempt && hydratedAttemptId === attemptId);
  const questions = activeAttempt?.questions || [];

  useEffect(() => {
    if (!activeAttempt || hydratedAttemptId === attemptId) return;
    hydrate(attemptId, activeAttempt.savedAnswers);
    setHydratedAttemptId(attemptId);
    if (activeAttempt.serverTime) useClockStore.getState().sync(activeAttempt.serverTime);
  }, [activeAttempt, attemptId, hydratedAttemptId, hydrate]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/attempts/${attemptId}/submit`);
      return unwrap(response);
    },
    onSuccess: (summary) => {
      setSubmittedSummary(summary);
      queryClient.setQueryData(['attempt', attemptId], summary);
      queryClient.invalidateQueries({ queryKey: ['student-exams'] });
      useAttemptStore.getState().reset();
      toast.success('Attempt submitted.');
    },
    onError: (error) => {
      submittingRef.current = false;
      const apiError = getApiError(error);
      toast.error(apiError.message);
    },
  });

  const handleExpiry = useCallback(() => {
    if (expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    toast.error('Time is up. Submitting your saved answers.');
    submitMutation.mutate();
  }, [submitMutation]);

  const autosave = useAutosave(attemptId, {
    savedAnswers: activeAttempt?.savedAnswers || [],
    onExpired: handleExpiry,
    onServerTime: (serverTime) => useClockStore.getState().sync(serverTime),
    debounceMs: 450,
  });

  const antiCheat = useAntiCheat(attemptId, {
    initialCount: activeAttempt?.violationCount || 0,
    maxViolations: activeAttempt?.exam?.violationPolicy?.maxViolations ?? 0,
    autoSubmit: activeAttempt?.exam?.violationPolicy?.autoSubmit ?? false,
    onAutoSubmit: () => {
      toast.error('The proctoring violation limit was reached. Submitting your attempt.');
      submitMutation.mutate();
    },
    onExpired: handleExpiry,
    enabled: ready && !submittedSummary,
  });

  const finalSummary = submittedSummary || (data?.status === 'submitted' ? data : null);

  useBeforeUnload(Boolean(activeAttempt) && !finalSummary);

  useEffect(() => {
    if (!ready) return undefined;
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
      if (confirmSubmit || questionSheetOpen || antiCheat.warning) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentIndex((currentIndex + 1) % questions.length);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentIndex((currentIndex - 1 + questions.length) % questions.length);
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleMark(questions[currentIndex].id);
      } else if (/^[1-6]$/.test(event.key)) {
        const item = questions[currentIndex];
        const option = item.question.options?.[Number(event.key) - 1];
        if (!option) return;
        event.preventDefault();
        if (item.question.type === 'single_choice') {
          setAnswer(item.id, { selectedOptionIds: [option.id] });
        } else if (item.question.type === 'multiple_choice') {
          const current = answers[item.id]?.selectedOptionIds || [];
          setAnswer(item.id, {
            selectedOptionIds: current.includes(option.id)
              ? current.filter((id) => id !== option.id)
              : [...current, option.id],
          });
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [answers, antiCheat.warning, confirmSubmit, currentIndex, questionSheetOpen, questions, ready, setAnswer, setCurrentIndex, toggleMark]);

  useEffect(() => {
    if (antiCheat.warning) setQuestionSheetOpen(false);
  }, [antiCheat.warning]);

  const submit = async () => {
    if (submittingRef.current || submitMutation.isPending) return;
    submittingRef.current = true;
    setConfirmSubmit(false);
    try {
      await autosave.flushNow();
      submitMutation.mutate();
    } catch {
      submittingRef.current = false;
    }
  };

  const saveAndExit = async () => {
    await autosave.flushNow();
    toast.success('Answers saved. You can resume this attempt from your dashboard.');
    navigate('/dashboard');
  };

  if (query.isPending) return <LoadingState label="Loading your attempt" />;
  if (query.isError) {
    return (
      <main className="page">
        <ErrorState message={getApiError(query.error).message} onRetry={query.refetch} />
      </main>
    );
  }

  if (finalSummary) {
    return (
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
            <Link className={finalSummary.resultAvailable ? 'btn-secondary' : 'btn-primary'} to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const currentItem = questions[currentIndex];
  if (!currentItem) {
    return (
      <main className="page">
        <ErrorState message="This attempt has no questions." onRetry={query.refetch} />
      </main>
    );
  }

  const answer = answers[currentItem.id] || {};
  const answeredCount = questions.filter((item) => isAnswerFilled(answers[item.id])).length;
  const markedCount = questions.filter((item) => answers[item.id]?.markedForReview).length;
  const unanswered = questions.length - answeredCount;
  const isLast = currentIndex === questions.length - 1;

  const goTo = (index) => {
    setCurrentIndex(index);
    setQuestionSheetOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseOption = (optionId) => {
    if (currentItem.question.type === 'single_choice') {
      setAnswer(currentItem.id, { selectedOptionIds: [optionId] });
      return;
    }
    const selected = answer.selectedOptionIds || [];
    setAnswer(currentItem.id, {
      selectedOptionIds: selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    });
  };

  return (
    <div className="attempt-shell">
      <ConnectivityBanner />
      <header className="attempt-topbar">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{activeAttempt.exam.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {questions.length} questions · {activeAttempt.maxScore} marks · Attempt in progress
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <SaveIndicator onRetry={autosave.flushNow} pendingCount={autosave.pendingCount} status={autosave.status} />
            <AttemptTimer enabled={ready} expiresAt={activeAttempt.expiresAt} onExpire={handleExpiry} />
            {antiCheat.fullscreenSupported && !antiCheat.fullscreenActive && (
              <button className="btn-secondary btn-sm hidden sm:inline-flex" onClick={antiCheat.requestFullscreen} type="button">
                Fullscreen
              </button>
            )}
            <button className="btn-ghost btn-sm hidden sm:inline-flex" onClick={saveAndExit} type="button">
              Save &amp; exit
            </button>
            <button className="btn-primary btn-sm" disabled={submitMutation.isPending} onClick={() => setConfirmSubmit(true)} type="button">
              {submitMutation.isPending ? 'Submitting…' : 'Review & submit'}
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0">
          {antiCheat.warning && !antiCheat.warning.pending && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100" role="alert">
              Proctoring signals recorded: <strong>{antiCheat.violationCount}</strong>
              {antiCheat.warning.max > 0 && <> of {antiCheat.warning.max}</>}.
              {antiCheat.warning.max > 0 && ' Reaching the limit may submit your attempt.'}
            </div>
          )}

          <article className="card p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <Badge tone="slate">{currentItem.marks} marks</Badge>
                {currentItem.negativeMarks > 0 && <Badge tone="red">−{currentItem.negativeMarks}</Badge>}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone="brand">{currentItem.question.subject}</Badge>
                <Badge tone="slate">{currentItem.question.type.replaceAll('_', ' ')}</Badge>
              </div>
            </div>

            <h1 className="question-text mt-4 font-semibold">{currentItem.question.prompt}</h1>

            {currentItem.question.type === 'numeric' ? (
              <NumericAnswerInput
                itemId={currentItem.id}
                onChange={(value) => setAnswer(currentItem.id, { numericValue: value })}
                value={answer.numericValue}
              />
            ) : (
              <fieldset className="mt-5 space-y-2.5">
                <legend className="sr-only">Answer choices</legend>
                {currentItem.question.type === 'multiple_choice' && (
                  <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Select all that apply.</p>
                )}
                {currentItem.question.options.map((option, index) => {
                  const selected = (answer.selectedOptionIds || []).includes(option.id);
                  return (
                    <label className={cn('option-row', selected && 'border-brand-500 bg-brand-50 dark:bg-brand-950/40')} key={option.id}>
                      <input
                        checked={selected}
                        name={`question-${currentItem.id}`}
                        onChange={() => chooseOption(option.id)}
                        type={currentItem.question.type === 'single_choice' ? 'radio' : 'checkbox'}
                      />
                      <span className="min-w-0">
                        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-sm leading-6 text-slate-800 dark:text-slate-200">{option.text}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap gap-2">
                <button
                  className={answer.markedForReview ? 'btn-secondary btn-sm border-amber-400 text-amber-800 dark:text-amber-300' : 'btn-secondary btn-sm'}
                  onClick={() => toggleMark(currentItem.id)}
                  type="button"
                >
                  {answer.markedForReview ? '★ Marked for review' : '☆ Mark for review'}
                </button>
                {isAnswerFilled(answer) && (
                  <button className="btn-ghost btn-sm" onClick={() => clearAnswer(currentItem.id)} type="button">
                    Clear response
                  </button>
                )}
              </div>
              <span className="hidden text-xs text-slate-400 sm:block">
                <span className="kbd">←</span> <span className="kbd">→</span> navigate · <span className="kbd">1–6</span> choose · <span className="kbd">M</span> mark
              </span>
            </div>
          </article>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button className="btn-secondary" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)} type="button">
              ← Previous
            </button>
            <button className="btn-ghost lg:hidden" onClick={() => setQuestionSheetOpen(true)} type="button">
              Palette
            </button>
            {isLast ? (
              <button className="btn-primary" onClick={() => setConfirmSubmit(true)} type="button">
                Review &amp; submit
              </button>
            ) : (
              <button className="btn-primary" onClick={() => goTo(currentIndex + 1)} type="button">
                Next →
              </button>
            )}
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="card sticky top-24 p-4">
            <QuestionPalette
              answers={answers}
              currentIndex={currentIndex}
              onSelect={goTo}
              questions={questions}
            />
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
              <p className="flex justify-between"><span>Answered</span><strong>{answeredCount}</strong></p>
              <p className="mt-1 flex justify-between"><span>Unanswered</span><strong>{unanswered}</strong></p>
              <p className="mt-1 flex justify-between"><span>Marked</span><strong>{markedCount}</strong></p>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={() => setConfirmSubmit(true)} type="button">
              Review &amp; submit
            </button>
            <button className="btn-ghost mt-1 w-full text-xs" onClick={saveAndExit} type="button">
              Save &amp; exit
            </button>
          </div>
        </aside>
      </main>

      {questionSheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close question palette" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setQuestionSheetOpen(false)} type="button" />
          <div className="bottom-sheet">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">Question palette</p>
              <button aria-label="Close" className="rounded-lg p-2 text-slate-500" onClick={() => setQuestionSheetOpen(false)} type="button">✕</button>
            </div>
            <QuestionPalette answers={answers} currentIndex={currentIndex} onSelect={goTo} questions={questions} />
          </div>
        </div>
      )}

      <Modal
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmSubmit(false)} type="button">Keep working</button>
            <button className="btn-primary" disabled={submitMutation.isPending} onClick={submit} type="button">
              {submitMutation.isPending ? 'Submitting…' : 'Submit attempt'}
            </button>
          </>
        }
        onClose={() => setConfirmSubmit(false)}
        open={confirmSubmit}
        size="sm"
        title="Submit this attempt?"
        description="Submission is final. You cannot change answers after this."
      >
        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
          <p className="flex justify-between py-0.5"><span className="text-slate-600 dark:text-slate-400">Answered</span><strong>{answeredCount}</strong></p>
          <p className="flex justify-between py-0.5"><span className="text-slate-600 dark:text-slate-400">Unanswered</span><strong>{unanswered}</strong></p>
          <p className="flex justify-between py-0.5"><span className="text-slate-600 dark:text-slate-400">Marked for review</span><strong>{markedCount}</strong></p>
        </div>
        {unanswered > 0 && (
          <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
            {unanswered} question{unanswered === 1 ? '' : 's'} will be submitted without an answer.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Remaining server time: {formatSeconds(Math.max(0, Math.ceil((new Date(activeAttempt.expiresAt).getTime() - clock()) / 1000)))}.
          Unsynced changes are sent before submission.
        </p>
      </Modal>

      <Modal
        footer={
          <button className="btn-primary" onClick={antiCheat.dismissWarning} type="button">
            Continue attempt
          </button>
        }
        onClose={antiCheat.dismissWarning}
        open={Boolean(antiCheat.warning) && !antiCheat.warning?.pending}
        size="sm"
        title="Proctoring signal recorded"
        description="This event was sent to your teacher for review."
      >
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p>
            Signal: <strong>{antiCheat.warning?.type?.replaceAll('_', ' ')}</strong>
          </p>
          <p className="mt-1">
            Total recorded: <strong>{antiCheat.warning?.count}</strong>
            {antiCheat.warning?.max > 0 ? ` of ${antiCheat.warning.max}` : ''}
          </p>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Stay on this tab and keep the exam in fullscreen. Reaching the violation limit may submit your attempt automatically.
        </p>
      </Modal>
    </div>
  );
};

export default AttemptPage;
