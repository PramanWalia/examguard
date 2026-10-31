import { useTheme } from '../hooks/useTheme';

export const ThemeToggle = ({ compact = false }) => {
  const { isDark, toggle } = useTheme();

  if (compact) {
    return (
      <button
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        onClick={toggle}
        type="button"
      >
        {isDark ? '☀' : '☾'}
      </button>
    );
  }

  return (
    <button className="btn-ghost w-full justify-start" onClick={toggle} type="button">
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  );
};

export default ThemeToggle;
