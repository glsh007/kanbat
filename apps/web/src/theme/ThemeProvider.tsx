import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SCHEME, type SchemeName } from '@app/tokens';
import { refreshUser, saveScheme, useUser } from '@/lib/session';
import { safeStorage } from '@/lib/storage';
import {
  applyScheme,
  applyTheme,
  isScheme,
  readScheme,
  SCHEME_STORAGE_KEY,
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';
import { ThemeContext } from './ThemeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readPreference()));
  const [scheme, setSchemeState] = useState<SchemeName>(readScheme);
  const user = useUser();

  useEffect(() => applyScheme(scheme), [scheme]);

  // Вошли (или кабинет обновился с другого устройства) — схема из кабинета главнее этого браузера
  const accountScheme = user ? (isScheme(user.scheme) ? user.scheme : DEFAULT_SCHEME) : null;
  // Цвет могли поменять на другом устройстве: сверяемся при входе и при возврате во вкладку
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void refreshUser(true);
    const onShow = () => document.visibilityState === 'visible' && void refreshUser();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [userId]);

  useEffect(() => {
    if (!accountScheme) return;
    safeStorage.set(SCHEME_STORAGE_KEY, accountScheme);
    setSchemeState(accountScheme);
  }, [accountScheme]);

  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyTheme(next);
    if (preference !== 'system') return;
    return watchSystemTheme((t) => {
      setResolved(t);
      applyTheme(t);
    });
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    safeStorage.set(THEME_STORAGE_KEY, p);
    setPref(p);
  }, []);

  const setScheme = useCallback((next: SchemeName) => {
    safeStorage.set(SCHEME_STORAGE_KEY, next);
    setSchemeState(next);
    void saveScheme(next); // в кабинет — чтобы на других устройствах был тот же цвет
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, scheme, setScheme }),
    [preference, resolved, setPreference, scheme, setScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
