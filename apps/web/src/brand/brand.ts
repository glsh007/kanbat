/**
 * Всё, что касается бренда, — в папке src/brand.
 * Название меняется здесь, в index.html (<title>) и в public/manifest.webmanifest.
 *
 * «Канбат» (Kanbat) = канбан + bat: обращения висят на доске, как летучая мышь на перекладине.
 */
export const BRAND = {
  name: 'Канбат',
  latin: 'Kanbat',
  shortName: 'Канбат',
  tagline: 'Обращения висят на доске, пока не решены',
} as const;
