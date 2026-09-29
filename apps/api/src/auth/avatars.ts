/**
 * Аватарки (ТЗ v4.18): своё фото (браузер обрезает по кругу и сжимает до 256 px) или готовый
 * рисунок — летучая мышь в цветах схем Канбата. Нет аватарки — на клиенте первая буква имени.
 *
 * В `User.avatar` хранится метка: `preset:p3` или `photo:<версия>`. Картинка отдаётся по адресу
 * `/api/avatars/<id пользователя>?v=<метка>` — метка в адресе сбрасывает кэш браузера при смене.
 */

/** Цвета — светлый и глубокий тон цветовых схем (packages/tokens, colorSchemes); контраст рисунка ≥ 3:1. */
const TONES = {
  // у терракоты глубокий тон (ржавчина) на крафте слишком бледен — графит палитры
  terracotta: { bg: '#D4A27F', fg: '#262624' },
  sage: { bg: '#B9C6BC', fg: '#2E4A3B' },
  sea: { bg: '#A9C3D3', fg: '#2F5F7F' },
  plum: { bg: '#CFAFC5', fg: '#7A3F68' },
  ochre: { bg: '#DCC792', fg: '#80611B' },
  graphite: { bg: '#C4C4BF', fg: '#4A4A47' },
} as const;

type Pose = 'fly' | 'hang' | 'moon' | 'headset';
type Tone = keyof typeof TONES;

export const PRESETS: Record<string, { pose: Pose; tone: Tone; label: string }> = {
  p1: { pose: 'fly', tone: 'terracotta', label: 'Мышь в полёте, терракота' },
  p2: { pose: 'hang', tone: 'sage', label: 'Мышь на перекладине, шалфей' },
  p3: { pose: 'moon', tone: 'sea', label: 'Мышь и луна, море' },
  p4: { pose: 'headset', tone: 'plum', label: 'Мышь в наушниках, слива' },
  p5: { pose: 'headset', tone: 'ochre', label: 'Мышь в наушниках, охра' },
  p6: { pose: 'fly', tone: 'sea', label: 'Мышь в полёте, море' },
  p7: { pose: 'moon', tone: 'graphite', label: 'Мышь и луна, графит' },
  p8: { pose: 'hang', tone: 'terracotta', label: 'Мышь на перекладине, терракота' },
};

/** Летучая мышь с раскрытыми крыльями: голова (50,40), туловище до y≈68. */
function bat(fg: string, bg: string): string {
  const wing =
    'M42 50 C34 40 21 38 10 44 C14 48 16 54 15 61 C20 57 25 58 28 63 C31 58 36 58 42 61 Z';
  return [
    `<path d="${wing}" fill="${fg}"/>`,
    `<path d="${wing}" fill="${fg}" transform="translate(100 0) scale(-1 1)"/>`,
    `<ellipse cx="50" cy="55" rx="9" ry="13" fill="${fg}"/>`,
    `<circle cx="50" cy="40" r="8" fill="${fg}"/>`,
    `<path d="M43 37 L44 27 L48.5 34 Z M57 37 L56 27 L51.5 34 Z" fill="${fg}"/>`,
    `<circle cx="47" cy="40" r="1.6" fill="${bg}"/><circle cx="53" cy="40" r="1.6" fill="${bg}"/>`,
  ].join('');
}

export function presetSvg(id: string): string | null {
  const p = PRESETS[id];
  if (!p) return null;
  const { bg, fg } = TONES[p.tone];
  let art: string;
  switch (p.pose) {
    case 'fly':
      art = bat(fg, bg);
      break;
    case 'hang':
      // висит вниз головой на перекладине
      art =
        `<path d="M24 17 H76" stroke="${fg}" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M47 17 V29 M53 17 V29" stroke="${fg}" stroke-width="2.5" stroke-linecap="round"/>` +
        `<g transform="rotate(180 50 50) translate(0 -3)">${bat(fg, bg)}</g>`;
      break;
    case 'moon':
      art =
        `<circle cx="36" cy="63" r="22" fill="${fg}"/><circle cx="46" cy="55" r="19" fill="${bg}"/>` +
        `<g transform="translate(40 8) scale(0.58)">${bat(fg, bg)}</g>`;
      break;
    case 'headset':
      art =
        bat(fg, bg) +
        `<path d="M37 42 A13 13 0 0 1 63 42" fill="none" stroke="${fg}" stroke-width="3"/>` +
        `<rect x="33" y="38" width="6" height="10" rx="2.5" fill="${fg}"/>` +
        `<rect x="61" y="38" width="6" height="10" rx="2.5" fill="${fg}"/>` +
        `<path d="M36 48 Q38 54 45 52" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round"/>`;
      break;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">` +
    `<rect width="100" height="100" fill="${bg}"/>${art}</svg>`
  );
}

/** Фото: только JPEG, PNG или WebP до 200 КБ (браузер уже сжал до 256×256). */
export const PHOTO_MAX_BYTES = 200 * 1024;

export function parsePhoto(raw: unknown): { mime: string; data: Buffer } | string {
  if (typeof raw !== 'string') return 'Нет картинки';
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!m) return 'Подойдёт картинка JPG, PNG или WebP';
  const data = Buffer.from(m[2], 'base64');
  if (data.length > PHOTO_MAX_BYTES) return 'Картинка больше 200 КБ';
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP';
  const mime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : '';
  if (!mime) return 'Файл не похож на картинку';
  return { mime, data };
}
