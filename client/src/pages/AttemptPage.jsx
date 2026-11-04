import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import apiClient, { unwrap } from '../api/client';
import {
  AttemptQuestionCard,
  AttemptTimer,
  isAnswerFilled,
  ProctoringWarningModal,
  QuestionPalette,
  SaveIndicator,
  SubmitAttemptModal,
  SubmittedAttemptView,
} from '../components/attempt/AttemptWidgets';
import { ConnectivityBanner } from '../components/ConnectivityBanner';
import { ErrorState, LoadingState } from '../components/States';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { useAutosave } from '../hooks/useAutosave';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { useAttemptStore } from '../store/attemptStore';
import { useClockStore } from '../store/clockStore';
import { getApiError } from '../utils/errors';

export { AttemptTimer, QuestionPalette };

const HEARTBEAT_INTERVAL_MS = 30_000;

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

  // Periodic server heartbeat for proctoring liveness detection.
  useEffect(() => {
    if (!ready || submittedSummary || !attemptId) return undefined;
    const interval = setInterval(() => {
      apiClient
        .post(
          `/attempts/${attemptId}/heartbeat`,
          { clientTime: new Date().toISOString() },
          { skipAuthRefresh: false },
        )
        .then((response) => {
          const payload = unwrap(response);
          if (payload?.serverTime) useClockStore.getState().sync(payload.serverTime);
          if (payload?.autoSubmitted) {
            toast.error('The proctoring violation limit was reached. Submitting your attempt.');
            submitMutation.mutate();
          }
        })
        .catch(() => {
          // Transient offline state is handled by ConnectivityBanner and server-side gap detection.
        });
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [attemptId, ready, submitMutation, submittedSummary]);

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
  }, [
    answers,
    antiCheat.warning,
    confirmSubmit,
    currentIndex,
    questionSheetOpen,
    questions,
    ready,
    setAnswer,
    setCurrentIndex,
    toggleMark,
  ]);

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
    return <SubmittedAttemptView attemptId={attemptId} finalSummary={finalSummary} />;
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
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
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

  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(activeAttempt.expiresAt).getTime() - clock()) / 1000),
  );

  return (
    <div className="attempt-shell">
      <ConnectivityBanner />
      <header className="attempt-topbar">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
              {activeAttempt.exam.title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {questions.length} questions · {activeAttempt.maxScore} marks · Attempt in progress
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <SaveIndicator
              onRetry={autosave.flushNow}
              pendingCount={autosave.pendingCount}
              status={autosave.status}
            />
            <AttemptTimer
              enabled={ready}
              expiresAt={activeAttempt.expiresAt}
              onExpire={handleExpiry}
            />
            {antiCheat.fullscreenSupported && !antiCheat.fullscreenActive && (
              <button
                className="btn-secondary btn-sm hidden sm:inline-flex"
                onClick={antiCheat.requestFullscreen}
                type="button"
              >
                Fullscreen
              </button>
            )}
            <button
              className="btn-ghost btn-sm hidden sm:inline-flex"
              onClick={saveAndExit}
              type="button"
            >
              Save &amp; exit
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={submitMutation.isPending}
              onClick={() => setConfirmSubmit(true)}
              type="button"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Review & submit'}
            </button>
          </div>
        </div>
        <div className="h-1 w-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-brand-600 transition-[width]"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0">
          {antiCheat.warning && !antiCheat.warning.pending && (
            <div
              className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
              role="alert"
            >
              Proctoring signals recorded: <strong>{antiCheat.violationCount}</strong>
              {antiCheat.warning.max > 0 && <> of {antiCheat.warning.max}</>}.
              {antiCheat.warning.max > 0 && ' Reaching the limit may submit your attempt.'}
            </div>
          )}

          <AttemptQuestionCard
            answer={answer}
            currentIndex={currentIndex}
            currentItem={currentItem}
            onChooseOption={chooseOption}
            onClearAnswer={() => clearAnswer(currentItem.id)}
            onNumericChange={(value) => setAnswer(currentItem.id, { numericValue: value })}
            onToggleMark={() => toggleMark(currentItem.id)}
            totalQuestions={questions.length}
          />

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              className="btn-secondary"
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
              type="button"
            >
              ← Previous
            </button>
            <button
              className="btn-ghost lg:hidden"
              onClick={() => setQuestionSheetOpen(true)}
              type="button"
            >
              Palette
            </button>
            {isLast ? (
              <button
                className="btn-primary"
                onClick={() => setConfirmSubmit(true)}
                type="button"
              >
                Review &amp; submit
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => goTo(currentIndex + 1)}
                type="button"
              >
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
              <p className="flex justify-between">
                <span>Answered</span>
                <strong>{answeredCount}</strong>
              </p>
              <p className="mt-1 flex justify-between">
                <span>Unanswered</span>
                <strong>{unanswered}</strong>
              </p>
              <p className="mt-1 flex justify-between">
                <span>Marked</span>
                <strong>{markedCount}</strong>
              </p>
            </div>
            <button
              className="btn-primary mt-4 w-full"
              onClick={() => setConfirmSubmit(true)}
              type="button"
            >
              Review &amp; submit
            </button>
            <button
              className="btn-ghost mt-1 w-full text-xs"
              onClick={saveAndExit}
              type="button"
            >
              Save &amp; exit
            </button>
          </div>
        </aside>
      </main>

      {questionSheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close question palette"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setQuestionSheetOpen(false)}
            type="button"
          />
          <div className="bottom-sheet">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">Question palette</p>
              <button
                aria-label="Close"
                className="rounded-lg p-2 text-slate-500"
                onClick={() => setQuestionSheetOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <QuestionPalette
              answers={answers}
              currentIndex={currentIndex}
              onSelect={goTo}
              questions={questions}
            />
          </div>
        </div>
      )}

      <SubmitAttemptModal
        answeredCount={answeredCount}
        isPending={submitMutation.isPending}
        markedCount={markedCount}
        onClose={() => setConfirmSubmit(false)}
        onSubmit={submit}
        open={confirmSubmit}
        remainingSeconds={remainingSeconds}
        unanswered={unanswered}
      />

      <ProctoringWarningModal
        onDismiss={antiCheat.dismissWarning}
        warning={antiCheat.warning}
      />
    </div>
  );
};

export default AttemptPage;
