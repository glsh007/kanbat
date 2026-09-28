import { createContext } from 'react';
import type { SchemeName } from '@app/tokens';
import type { ResolvedTheme, ThemePreference } from './theme';

export type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** Цветовая схема — своя у каждого человека, хранится в кабинете (ТЗ v4.11). */
  scheme: SchemeName;
  setScheme: (s: SchemeName) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
