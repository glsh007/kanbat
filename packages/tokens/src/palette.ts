/**
 * Базовая палитра «Канбата» — в духе интерфейса Claude (приблизительные значения):
 * тёплый крем и песок, терракота, камень и тёплый графит.
 * Новые цвета — только по согласованию. Допускаются прозрачность и оттенки
 * (смешивание этих цветов между собой, tint/shade).
 */
export const palette = {
  cream: '#FAF9F5',
  sand: '#F0EEE6',
  stone: '#BFBFBA',
  kraft: '#D4A27F',
  clay: '#D97757',
  rust: '#B4552F',
  slate: '#262624',
  ink: '#141413',
} as const;

export type PaletteKey = keyof typeof palette;

export const paletteLabels: Record<PaletteKey, string> = {
  cream: 'Крем',
  sand: 'Песок',
  stone: 'Камень',
  kraft: 'Крафт',
  clay: 'Терракота',
  rust: 'Ржавчина',
  slate: 'Графит',
  ink: 'Чернила',
};

/**
 * Цветовые схемы (ТЗ v4.11): человек выбирает акцент интерфейса для себя.
 * Нейтральные цвета (крем, песок, камень, графит, чернила) общие; схема задаёт только
 * три акцентных тона — светлый, основной и глубокий (как крафт / терракота / ржавчина).
 * Из них генератор строит обе темы; контраст каждой схемы проверяется (`npm run check`).
 */
export type AccentTones = { light: string; main: string; deep: string };

export const colorSchemes = {
  terracotta: { label: 'Терракота', light: palette.kraft, main: palette.clay, deep: palette.rust },
  // исходная палитра проекта: шалфей и лес
  sage: { label: 'Шалфей', light: '#B9C6BC', main: '#8FA394', deep: '#2E4A3B' },
  sea: { label: 'Море', light: '#A9C3D3', main: '#6E9BBA', deep: '#2F5F7F' },
  plum: { label: 'Слива', light: '#CFAFC5', main: '#B07D9F', deep: '#7A3F68' },
  ochre: { label: 'Охра', light: '#DCC792', main: '#C9A24A', deep: '#80611B' },
  graphite: { label: 'Графит', light: '#C4C4BF', main: '#9A9A95', deep: '#4A4A47' },
} as const satisfies Record<string, AccentTones & { label: string }>;

export type SchemeName = keyof typeof colorSchemes;
export const DEFAULT_SCHEME: SchemeName = 'terracotta';
export const schemeNames = Object.keys(colorSchemes) as SchemeName[];
