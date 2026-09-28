import { DEFAULT_SCHEME, schemeNames, themes, type SchemeName } from '@app/tokens';
import { safeStorage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Ключ должен совпадать с inline-скриптом в index.html. */
export const THEME_STORAGE_KEY = 'kc-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readPreference(): ThemePreference {
  const v = safeStorage.get(THEME_STORAGE_KEY);
  // Тёмная тема по умолчанию (ТЗ v2, п. 8); «Системная» — по выбору в переключателе
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

/** Ставит data-theme на <html> и цвет адресной строки браузера. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = themes[theme].bg.hex;
}

export function watchSystemTheme(onChange: (t: ResolvedTheme) => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  const handler = () => onChange(mq.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/** Цветовая схема (ТЗ v4.11). Ключ совпадает с inline-скриптом в index.html. */
export const SCHEME_STORAGE_KEY = 'kc-scheme';

export const isScheme = (v: unknown): v is SchemeName =>
  typeof v === 'string' && (schemeNames as string[]).includes(v);

export function readScheme(): SchemeName {
  const v = safeStorage.get(SCHEME_STORAGE_KEY);
  return isScheme(v) ? v : DEFAULT_SCHEME;
}

/** Ставит data-scheme на <html>: токены схемы перекрывают акценты темы. */
export function applyScheme(scheme: SchemeName): void {
  document.documentElement.dataset.scheme = scheme;
}
