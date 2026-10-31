// Fallbacks for the batch picker when an older API/mock does not return meta.batches.
export const FALLBACK_BATCHES = [
  { id: 'CSE-A', name: 'CSE A' },
  { id: 'CSE-B', name: 'CSE B' },
  { id: 'ECE-A', name: 'ECE A' },
];

export const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'numeric', label: 'Numeric' },
];

export const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export const RESULT_MODES = [
  { value: 'immediate', label: 'Immediately after submit' },
  { value: 'after_end', label: 'After the exam ends' },
  { value: 'manual', label: 'When I release them' },
];

export const VIOLATION_TYPES = {
  TAB_HIDDEN: 'tab_hidden',
  WINDOW_BLUR: 'window_blur',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  COPY: 'copy',
  PASTE: 'paste',
  CONTEXT_MENU: 'context_menu',
  SHORTCUT: 'shortcut',
  OTHER: 'other',
};
