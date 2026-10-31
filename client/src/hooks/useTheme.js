import { useThemeStore } from '../store/themeStore';

export const useTheme = () => {
  const theme = useThemeStore((state) => state.theme);
  const toggle = useThemeStore((state) => state.toggle);
  const setTheme = useThemeStore((state) => state.setTheme);

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
};

export default useTheme;
