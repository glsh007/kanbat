import { mix, shade, tint } from './color';
import { colorSchemes, palette as p, type AccentTones, type SchemeName } from './palette';

/** Значение токена: сплошной цвет или цвет с прозрачностью. */
export type TokenValue = { hex: string; alpha?: number };

const solid = (hex: string): TokenValue => ({ hex });
const alpha = (hex: string, a: number): TokenValue => ({ hex, alpha: a });

/**
 * Смысловые (semantic) токены. В компонентах используются только они —
 * базовую палитру напрямую в интерфейсе не применяем.
 */
export const semanticTokenNames = [
  // поверхности
  'bg', // фон приложения
  'surface', // карточки, панели
  'surface-sunken', // фон столбцов доски, полей ввода
  'surface-inverse', // шапка/акцентные плашки
  // текст
  'fg',
  'fg-muted',
  'heading',
  'on-inverse',
  // действия
  'primary',
  'primary-hover',
  'primary-border',
  'on-primary',
  'accent',
  'accent-soft',
  'on-accent-soft',
  // линии и фокус
  'border',
  'border-strong',
  'focus',
  // градиент готовности столбцов: Черновик → Готово
  'col-1',
  'col-2',
  'col-3',
  'col-4',
  'col-5',
  // метки разделов
  'label-clay',
  'label-kraft',
  'label-stone',
  'label-slate',
  // тени
  'shadow',
  // оверлей модальных окон
  'scrim',
  // обои доски (как фон чата в мессенджерах): 4 точки градиента + цвет узора
  'wallpaper-1',
  'wallpaper-2',
  'wallpaper-3',
  'wallpaper-4',
  'wallpaper-ink',
  // полупрозрачный фон столбцов поверх обоев
  'column',
  // логотип: тёмные части (в эскизе — тёмно-синий) и акцент (бирюзовый)
  'logo-primary',
  'logo-accent',
] as const;

export type SemanticToken = (typeof semanticTokenNames)[number];
export type Theme = Record<SemanticToken, TokenValue>;
export type ThemeName = 'light' | 'dark';

const lightSurface = tint(p.cream, 0.6);
const lightSunken = p.sand;

/** Светлая тема для акцентов схемы: `a.light` ≈ крафт, `a.main` ≈ терракота, `a.deep` ≈ ржавчина. */
export function buildLight(a: AccentTones): Theme {
  return {
    bg: solid(p.cream),
    surface: solid(lightSurface),
    'surface-sunken': solid(lightSunken),
    'surface-inverse': solid(p.slate),

    fg: solid(mix(p.ink, p.slate, 0.6)),
    'fg-muted': solid(mix(p.slate, p.stone, 0.42)),
    heading: solid(p.ink),
    'on-inverse': solid(p.cream),

    primary: solid(a.deep),
    'primary-hover': solid(shade(a.deep, 0.14)),
    'primary-border': solid(a.deep),
    'on-primary': solid(p.cream),
    accent: solid(a.main),
    'accent-soft': alpha(a.main, 0.16),
    'on-accent-soft': solid(shade(a.deep, 0.28)),

    border: solid(mix(p.sand, p.stone, 0.55)),
    'border-strong': solid(mix(p.stone, p.slate, 0.42)),
    focus: solid(a.deep),

    // градиент готовности: камень → крафт → терракота («теплеет» к Готово)
    'col-1': solid(p.stone),
    'col-2': solid(mix(p.stone, a.light, 0.6)),
    'col-3': solid(a.light),
    'col-4': solid(a.main),
    'col-5': solid(a.deep),

    'label-clay': solid(a.main),
    'label-kraft': solid(a.light),
    'label-stone': solid(mix(p.stone, p.slate, 0.2)),
    'label-slate': solid(p.slate),

    shadow: alpha(p.ink, 0.07),
    scrim: alpha(p.slate, 0.45),

    // обои: тёплый крем с отсветами терракоты
    'wallpaper-1': solid(mix(p.cream, a.main, 0.14)),
    'wallpaper-2': solid(p.sand),
    'wallpaper-3': solid(mix(p.cream, a.light, 0.22)),
    'wallpaper-4': solid(mix(p.sand, p.stone, 0.3)),
    'wallpaper-ink': alpha(a.deep, 0.13),
    column: alpha(lightSurface, 0.55),

    'logo-primary': solid(p.ink),
    'logo-accent': solid(a.main),
  };
}

const darkBg = p.slate;
const darkSurface = mix(p.slate, p.cream, 0.05);
const darkSunken = shade(p.slate, 0.25);

/** Тёмная тема для акцентов схемы. */
export function buildDark(a: AccentTones): Theme {
  return {
    bg: solid(darkBg),
    surface: solid(darkSurface),
    'surface-sunken': solid(darkSunken),
    'surface-inverse': solid(p.ink),

    fg: solid(p.cream),
    'fg-muted': solid(mix(p.cream, p.stone, 0.55)),
    heading: solid(p.cream),
    'on-inverse': solid(p.cream),

    // терракота Claude: с тёмным текстом контраст 5.9 (со светлым — только 3)
    primary: solid(a.main),
    'primary-hover': solid(mix(a.main, a.light, 0.3)),
    'primary-border': solid(a.main),
    'on-primary': solid(p.ink),
    accent: solid(a.main),
    'accent-soft': alpha(a.main, 0.2),
    'on-accent-soft': solid(mix(a.main, p.cream, 0.55)),

    border: solid(mix(p.slate, p.stone, 0.22)),
    'border-strong': solid(mix(p.slate, p.stone, 0.62)),
    focus: solid(a.main),

    'col-1': solid(mix(p.slate, p.stone, 0.4)),
    'col-2': solid(mix(p.slate, p.stone, 0.75)),
    'col-3': solid(mix(p.stone, a.light, 0.6)),
    'col-4': solid(a.light),
    'col-5': solid(a.main),

    'label-clay': solid(a.main),
    'label-kraft': solid(a.light),
    'label-stone': solid(p.stone),
    'label-slate': solid(mix(p.slate, p.stone, 0.3)),

    shadow: alpha(p.ink, 0.45),
    scrim: alpha(p.ink, 0.6),

    'wallpaper-1': solid(mix(p.slate, a.main, 0.14)),
    'wallpaper-2': solid(shade(p.slate, 0.2)),
    'wallpaper-3': solid(mix(p.slate, a.light, 0.1)),
    'wallpaper-4': solid(mix(shade(p.slate, 0.15), a.main, 0.08)),
    'wallpaper-ink': alpha(a.main, 0.14),
    column: alpha(darkSunken, 0.6),

    'logo-primary': solid(p.cream),
    'logo-accent': solid(a.main),
  };
}

export const light = buildLight(colorSchemes.terracotta);
export const dark = buildDark(colorSchemes.terracotta);
export const themes: Record<ThemeName, Theme> = { light, dark };

/** Все схемы в обеих темах. */
export const schemeThemes = Object.fromEntries(
  Object.entries(colorSchemes).map(([name, tones]) => [
    name,
    { light: buildLight(tones), dark: buildDark(tones) },
  ]),
) as Record<SchemeName, Record<ThemeName, Theme>>;
