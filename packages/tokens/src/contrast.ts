import { composite, contrast } from './color';
import { schemeNames, type SchemeName } from './palette';
import { schemeThemes, type SemanticToken, type Theme, type ThemeName } from './themes';

/** 4.5 — обычный текст (WCAG AA), 3 — элементы интерфейса и крупный текст. */
export type ContrastLevel = 4.5 | 3;

export type ContrastPair = {
  fg: SemanticToken;
  /**
   * Поверхность, на которой лежит `fg`. Если фон полупрозрачный — `over` задаёт подложку;
   * массив — цепочка слоёв сверху вниз (последний должен быть непрозрачным).
   */
  bg: SemanticToken;
  over?: SemanticToken | SemanticToken[];
  min: ContrastLevel;
  note: string;
};

export const contrastPairs: ContrastPair[] = [
  { fg: 'fg', bg: 'bg', min: 4.5, note: 'Основной текст на фоне' },
  { fg: 'fg', bg: 'surface', min: 4.5, note: 'Текст на карточке' },
  { fg: 'fg', bg: 'surface-sunken', min: 4.5, note: 'Текст в столбце / поле ввода' },
  { fg: 'fg-muted', bg: 'bg', min: 4.5, note: 'Вторичный текст на фоне' },
  { fg: 'fg-muted', bg: 'surface', min: 4.5, note: 'Вторичный текст на карточке' },
  { fg: 'fg-muted', bg: 'surface-sunken', min: 4.5, note: 'Вторичный текст в столбце' },
  { fg: 'heading', bg: 'bg', min: 4.5, note: 'Заголовок на фоне' },
  { fg: 'heading', bg: 'surface', min: 4.5, note: 'Заголовок на карточке' },
  { fg: 'on-inverse', bg: 'surface-inverse', min: 4.5, note: 'Текст на тёмной плашке' },
  { fg: 'on-primary', bg: 'primary', min: 4.5, note: 'Текст основной кнопки' },
  { fg: 'on-primary', bg: 'primary-hover', min: 4.5, note: 'Текст кнопки при наведении' },
  {
    fg: 'on-accent-soft',
    bg: 'accent-soft',
    over: 'surface',
    min: 4.5,
    note: 'Текст бейджа на карточке',
  },
  { fg: 'on-accent-soft', bg: 'accent-soft', over: 'bg', min: 4.5, note: 'Текст бейджа на фоне' },
  { fg: 'primary-border', bg: 'bg', min: 3, note: 'Граница основной кнопки на фоне' },
  { fg: 'primary-border', bg: 'surface', min: 3, note: 'Граница основной кнопки на карточке' },
  { fg: 'border-strong', bg: 'bg', min: 3, note: 'Граница поля ввода на фоне' },
  { fg: 'border-strong', bg: 'surface', min: 3, note: 'Граница поля ввода на карточке' },
  { fg: 'focus', bg: 'bg', min: 3, note: 'Кольцо фокуса на фоне' },
  { fg: 'focus', bg: 'surface', min: 3, note: 'Кольцо фокуса на карточке' },
  { fg: 'focus', bg: 'surface-sunken', min: 3, note: 'Кольцо фокуса в столбце' },
  // Столбцы полупрозрачные и лежат на обоях: проверяем худший случай —
  // штрих узора поверх каждой из 4 точек градиента.
  ...(['wallpaper-1', 'wallpaper-2', 'wallpaper-3', 'wallpaper-4'] as const).flatMap(
    (w, i): ContrastPair[] => [
      {
        fg: 'fg',
        bg: 'column',
        over: ['wallpaper-ink', w],
        min: 4.5,
        note: `Текст в столбце поверх обоев (точка ${i + 1})`,
      },
      {
        fg: 'fg-muted',
        bg: 'column',
        over: ['wallpaper-ink', w],
        min: 4.5,
        note: `Вторичный текст в столбце поверх обоев (точка ${i + 1})`,
      },
      {
        fg: 'heading',
        bg: 'column',
        over: ['wallpaper-ink', w],
        min: 4.5,
        note: `Заголовок столбца поверх обоев (точка ${i + 1})`,
      },
    ],
  ),
];

export type ContrastResult = ContrastPair & {
  scheme: SchemeName;
  theme: ThemeName;
  fgHex: string;
  bgHex: string;
  ratio: number;
  pass: boolean;
};

function resolveSolid(
  theme: Theme,
  token: SemanticToken,
  over: SemanticToken | SemanticToken[] = [],
): string {
  const v = theme[token];
  if (v.alpha === undefined) return v.hex;
  const [next, ...rest] = Array.isArray(over) ? over : [over];
  if (!next) throw new Error(`Токен ${token} полупрозрачный — укажите подложку (over)`);
  return composite(v.hex, v.alpha, resolveSolid(theme, next, rest));
}

/** Контраст всех пар — в каждой цветовой схеме и в обеих темах. */
export function checkContrast(): ContrastResult[] {
  const out: ContrastResult[] = [];
  for (const scheme of schemeNames) {
    for (const name of ['light', 'dark'] as ThemeName[]) {
      const theme = schemeThemes[scheme][name];
      for (const pair of contrastPairs) {
        const fgHex = resolveSolid(theme, pair.fg);
        const bgHex = resolveSolid(theme, pair.bg, pair.over);
        const ratio = Math.round(contrast(fgHex, bgHex) * 100) / 100;
        out.push({ ...pair, scheme, theme: name, fgHex, bgHex, ratio, pass: ratio >= pair.min });
      }
    }
  }
  return out;
}
