/**
 * Минимальная цветовая математика: смешивание в sRGB (как CSS color-mix(in srgb)),
 * наложение полупрозрачного цвета и контраст по WCAG 2.x.
 */

export type Rgb = { r: number; g: number; b: number };
export type Rgba = Rgb & { a: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Неверный HEX: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Смешивает `a` и `b`; `amountB` — доля второго цвета (0…1). */
export function mix(a: string, b: string, amountB: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const t = amountB;
  return rgbToHex({
    r: x.r * (1 - t) + y.r * t,
    g: x.g * (1 - t) + y.g * t,
    b: x.b * (1 - t) + y.b * t,
  });
}

/** Светлее: смешивание с белым (tint). */
export const tint = (c: string, amount: number) => mix(c, '#FFFFFF', amount);
/** Темнее: смешивание с чёрным (shade). */
export const shade = (c: string, amount: number) => mix(c, '#000000', amount);

/** Итоговый непрозрачный цвет, если `fg` с альфой `alpha` лежит на `bg`. */
export function composite(fg: string, alpha: number, bg: string): string {
  return mix(bg, fg, alpha);
}

export function toRgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 1000) / 1000})`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
