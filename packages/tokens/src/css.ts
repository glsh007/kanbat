import { toRgbaString } from './color';
import { DEFAULT_SCHEME, palette, schemeNames } from './palette';
import { schemeThemes, semanticTokenNames, themes, type Theme, type TokenValue } from './themes';

const value = (v: TokenValue) => (v.alpha === undefined ? v.hex : toRgbaString(v.hex, v.alpha));

function block(
  selector: string,
  theme: Theme,
  scheme: 'light' | 'dark' | null,
  indent = '',
  base?: Theme,
): string {
  // для схемы — только токены, которые отличаются от схемы по умолчанию
  const names = semanticTokenNames.filter((n) => !base || value(base[n]) !== value(theme[n]));
  const lines = names.map((n) => `${indent}  --${n}: ${value(theme[n])};`);
  const cs = scheme ? `${indent}  color-scheme: ${scheme};\n` : '';
  return `${indent}${selector} {\n${cs}${lines.join('\n')}\n${indent}}`;
}

/**
 * Цветовые схемы — атрибут `data-scheme` на <html> (ТЗ v4.11). Селекторы специфичнее тем:
 * схема в светлой теме (0,2,0) перекрывает базовую светлую, в тёмной (0,3,0) — базовую тёмную.
 */
function schemeBlocks(): string[] {
  return schemeNames
    .filter((n) => n !== DEFAULT_SCHEME)
    .flatMap((n) => {
      const t = schemeThemes[n];
      const at = `[data-scheme="${n}"]`;
      return [
        `/* Схема «${n}» */`,
        block(`:root${at}`, t.light, null, '', themes.light),
        '',
        '@media (prefers-color-scheme: dark) {',
        block(`:root${at}:not([data-theme="light"])`, t.dark, null, '  ', themes.dark),
        '}',
        '',
        block(`:root${at}[data-theme="dark"]`, t.dark, null, '', themes.dark),
        '',
      ];
    });
}

/**
 * Генерирует CSS с палитрой и смысловыми токенами обеих тем.
 * Тема выбирается атрибутом `data-theme` на <html>; без JS — по системной настройке.
 */
export function buildTokensCss(): string {
  const paletteLines = Object.entries(palette)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');

  return [
    '/* Сгенерировано packages/tokens/scripts/build-css.ts — не редактировать вручную. */',
    '/* Источник: packages/tokens/src/themes.ts */',
    '',
    `:root {\n${paletteLines}\n}`,
    '',
    block(':root, [data-theme="light"]', themes.light, 'light'),
    '',
    '@media (prefers-color-scheme: dark) {',
    block(':root:not([data-theme="light"])', themes.dark, 'dark', '  '),
    '}',
    '',
    block('[data-theme="dark"]', themes.dark, 'dark'),
    '',
    ...schemeBlocks(),
  ].join('\n');
}
