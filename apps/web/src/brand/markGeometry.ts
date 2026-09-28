/**
 * Знак «Канбата»: летучая мышь висит вниз головой на перекладине — как обращение
 * «висит» на доске, пока его не решат. Сложенные крылья делят тело на три полосы —
 * это столбцы канбан-доски. Рисунок оригинальный.
 *
 * Единый источник геометрии для <Logo /> и генератора иконок (scripts/gen-icons.ts).
 * Сетка 100×100:
 *   accent  — перекладина (терракота);
 *   primary — тело с головой и ушами, лапки (чернила; в тёмной теме — крем);
 *   вырезы  — складки крыльев и глаза (прозрачные, работают на любом фоне).
 */
export const MARK_VIEWBOX = '0 0 100 100';

/** Перекладина. */
export const MARK_BAR = { x: 12, y: 9, w: 76, h: 7, r: 3.5 };

/** Лапки: от перекладины к телу, с «крючками» поверх перекладины. */
export const MARK_FEET =
  'M40 25 V14 Q40 7.5 45 7.5 Q47.5 7.5 47.5 10 V13 H44.5 V25 Z ' +
  'M60 25 V14 Q60 7.5 55 7.5 Q52.5 7.5 52.5 10 V13 H55.5 V25 Z';

/**
 * Тело вниз головой: сверху (у лапок) узкие «плечи» крыльев, по бокам крылья
 * расходятся и плавно сходятся к голове; внизу голова с ушами, направленными вниз.
 */
export const MARK_BODY =
  'M36 22 H64 Q70 22 72 28 L78 52 Q80 62 71 68 L63 72 ' +
  'L69 92 Q69.5 95.5 66.5 94 L57 86 Q50 90 43 86 L33.5 94 Q30.5 95.5 31 92 L37 72 ' +
  'L29 68 Q20 62 22 52 L28 28 Q30 22 36 22 Z';

/** Складки крыльев (вырезы): делят тело на три «столбца». */
export const MARK_FOLDS = ['M42.5 27 Q40 46 44 68', 'M57.5 27 Q60 46 56 68'];
export const MARK_FOLD_WIDTH = 3;

/** Глаза (вырезы) — у перевёрнутой головы они над ушами. */
export const MARK_EYES = [
  { cx: 45, cy: 78, r: 2.4 },
  { cx: 55, cy: 78, r: 2.4 },
];

/** SVG-разметка знака без внешнего <svg> — для статических иконок. */
export function markInnerSvg(primary: string, accent: string, maskId = 'kc-mark-cut'): string {
  const b = MARK_BAR;
  return [
    `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">`,
    `<rect width="100" height="100" fill="#fff"/>`,
    ...MARK_FOLDS.map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#000" stroke-width="${MARK_FOLD_WIDTH}" stroke-linecap="round"/>`,
    ),
    ...MARK_EYES.map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="#000"/>`),
    `</mask></defs>`,
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${accent}"/>`,
    `<g mask="url(#${maskId})">`,
    `<path d="${MARK_BODY}" fill="${primary}"/>`,
    `</g>`,
    `<path d="${MARK_FEET}" fill="${primary}"/>`,
  ].join('');
}
