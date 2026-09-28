import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme должен вызываться внутри <ThemeProvider>');
  return ctx;
}
