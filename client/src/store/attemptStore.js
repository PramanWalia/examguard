import { create } from 'zustand';

const emptyAnswer = () => ({
  selectedOptionIds: [],
  numericValue: null,
  markedForReview: false,
});

const normalize = (answer = {}) => ({
  selectedOptionIds: Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds : [],
  numericValue: answer.numericValue ?? null,
  markedForReview: Boolean(answer.markedForReview),
});

// Answers live here for instant UI feedback. The server remains the source of truth;
// this store is hydrated from savedAnswers on start/resume and never persisted to disk.
export const useAttemptStore = create((set, get) => ({
  attemptId: null,
  answers: {},
  currentIndex: 0,
  paletteOpen: false,
  isReviewing: false,

  hydrate: (attemptId, savedAnswers = []) =>
    set({
      attemptId,
      answers: Object.fromEntries(savedAnswers.map((answer) => [answer.itemId, normalize(answer)])),
      currentIndex: 0,
      paletteOpen: false,
      isReviewing: false,
    }),

  setAnswer: (itemId, patch) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [itemId]: {
          ...(state.answers[itemId] || emptyAnswer()),
          ...patch,
        },
      },
    })),

  toggleMark: (itemId) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [itemId]: {
          ...(state.answers[itemId] || emptyAnswer()),
          markedForReview: !state.answers[itemId]?.markedForReview,
        },
      },
    })),

  clearAnswer: (itemId) =>
    set((state) => ({
      answers: {
        ...state.answers,
        [itemId]: {
          ...(state.answers[itemId] || emptyAnswer()),
          selectedOptionIds: [],
          numericValue: null,
        },
      },
    })),

  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setIsReviewing: (isReviewing) => set({ isReviewing }),
  getAnswer: (itemId) => get().answers[itemId] || emptyAnswer(),

  reset: () =>
    set({
      attemptId: null,
      answers: {},
      currentIndex: 0,
      paletteOpen: false,
      isReviewing: false,
    }),
}));
