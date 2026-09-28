/**
 * Генерирует бесшовную плитку «дудлов» для обоев доски:
 * apps/web/src/assets/wallpaper-doodles.svg
 *
 * Иконки оригинальные, в тематике продукта (карточки, облачка чата, галочки,
 * скрепки, листики…). Плитка используется как CSS mask, поэтому цвет штрихов
 * здесь не важен — реальный цвет задаёт токен --wallpaper-ink.
 *
 * Запуск: npm run wallpaper -w @app/web
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TILE = 360;
const STEP = 60;
/** Радиус «габарита» иконки: если иконка ближе к краю — дублируем её на другой стороне. */
const R = 22;

/** Иконки в поле 32×32 с центром в (0, 0). Только контуры. */
const icons: Record<string, string> = {
  card: '<rect x="-13" y="-10" width="26" height="20" rx="3.5"/><path d="M-8 -4h11M-8 1h16M-8 6h7"/>',
  bubble:
    '<path d="M-12 -8a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9l-6 5v-5h-1a4 4 0 0 1-4-4z"/><path d="M-5 -3.5h10M-5 1h6"/>',
  check: '<circle r="11"/><path d="M-5 0.5l3.5 3.5l6.5-7"/>',
  clip: '<path d="M4 -8v12a5 5 0 0 1-10 0v-14a3.5 3.5 0 0 1 7 0v13a1.5 1.5 0 0 1-3 0v-10"/>',
  sparkle:
    '<path d="M0 -12c1.5 7 5 10.5 12 12c-7 1.5-10.5 5-12 12c-1.5-7-5-10.5-12-12c7-1.5 10.5-5 12-12z"/>',
  leaf: '<path d="M-11 11c0-14 8-22 22-22c0 14-8 22-22 22z"/><path d="M-11 11l13-13"/>',
  pencil: '<path d="M-10 10l2.5-7.5l13-13l5 5l-13 13z"/><path d="M2.5 -8l5 5"/>',
  clock: '<circle r="11"/><path d="M0 -6v6l4 3"/>',
  note: '<path d="M-10 -11h20v14l-8 8h-12z"/><path d="M10 3h-8v8"/>',
  bulb: '<path d="M-5 7c0-4-6-5-6-11a11 11 0 0 1 22 0c0 6-6 7-6 11z"/><path d="M-4 11h8"/>',
  calendar:
    '<rect x="-11" y="-9" width="22" height="20" rx="3"/><path d="M-11 -3h22M-5 -12v5M5 -12v5M-5 3h2M2 3h2M-5 7h2"/>',
  columns:
    '<rect x="-12" y="-11" width="7" height="22" rx="2"/><rect x="-3.5" y="-11" width="7" height="15" rx="2"/><rect x="5" y="-11" width="7" height="9" rx="2"/>',
  cup: '<path d="M-10 -4h15v7a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7z"/><path d="M5 -1h2a3 3 0 0 1 0 6h-2M-5 -12c-1 2 1 3 0 5M0 -12c-1 2 1 3 0 5"/>',
  pin: '<path d="M0 12c-6-7-9-11-9-16a9 9 0 0 1 18 0c0 5-3 9-9 16z"/><circle cy="-4" r="3"/>',
  heart: '<path d="M0 10c-9-6-12-10-12-14a6 6 0 0 1 12-2a6 6 0 0 1 12 2c0 4-3 8-12 14z"/>',
  chats:
    '<path d="M-12 -9a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3v-3a3 3 0 0 1-3-3z"/><path d="M8 -4h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3v3l-4-3h-6a3 3 0 0 1-3-3v-1"/>',
  flag: '<path d="M-8 12v-24M-8 -11h16l-4 5l4 5h-16"/>',
  // летучие мыши «Канбата»: висит на перекладине и летит (оригинальные контуры)
  batHang:
    '<path d="M-12 -12h24"/><path d="M-3 -12v4M3 -12v4"/><path d="M-6 -8h12q3 0 4 3l2 8q1 5-4 7l-4 2l2 7l-5-4q-2 1-4 0l-5 4l2-7l-4-2q-5-2-4-7l2-8q1-3 4-3z"/>',
  batFly:
    '<path d="M0 -3q3 0 3 4q0 4-3 4q-3 0-3-4q0-4 3-4z"/><path d="M-1.5 -2.5l-1-3M1.5 -2.5l1-3"/><path d="M3 0q6-7 13-5q-3 3-2 7q-3-2-5 1q-2-3-6 0M-3 0q-6-7-13-5q3 3 2 7q3-2 5 1q2-3 6 0"/>',
  arrow: '<path d="M-11 6c4-10 12-13 20-11"/><path d="M4 -10l5 5l-6 4"/>',
};

const fillers = [
  '<circle r="1.6"/>',
  '<path d="M-3 0h6M0 -3v6"/>',
  '<circle r="3"/>',
  '<path d="M-3 -3l6 6M3 -3l-6 6"/>',
];

/** Детерминированный генератор: плитка всегда одинаковая. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const rand = rng(20260926);
const names = Object.keys(icons);
const parts: string[] = [];

/** «Колода» иконок: перемешивается заново, когда заканчивается, — соседи не повторяются. */
let deck: string[] = [];
function nextIcon(): string {
  if (deck.length === 0) {
    deck = [...names];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
  }
  return deck.pop()!;
}

function place(markup: string, x: number, y: number, rot: number, scale: number, r: number) {
  const xs = [x, ...(x < r ? [x + TILE] : []), ...(x > TILE - r ? [x - TILE] : [])];
  const ys = [y, ...(y < r ? [y + TILE] : []), ...(y > TILE - r ? [y - TILE] : [])];
  for (const px of xs)
    for (const py of ys)
      parts.push(
        `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(0)}) scale(${scale.toFixed(2)})">${markup}</g>`,
      );
}

for (let row = 0; row < TILE / STEP; row++) {
  for (let col = 0; col < TILE / STEP; col++) {
    const offset = row % 2 ? STEP / 2 : 0;
    const x = (col * STEP + STEP / 2 + offset + (rand() - 0.5) * 20 + TILE) % TILE;
    const y = row * STEP + STEP / 2 + (rand() - 0.5) * 20;
    place(icons[nextIcon()]!, x, y, (rand() - 0.5) * 70, 0.75 + rand() * 0.5, R);

    // Мелкие точки/плюсики между иконками — как «пыль» в чатах мессенджеров.
    const fx = (x + STEP / 2 + (rand() - 0.5) * 10 + TILE) % TILE;
    const fy = (y + STEP / 2 + (rand() - 0.5) * 10 + TILE) % TILE;
    place(fillers[Math.floor(rand() * fillers.length)]!, fx, fy, rand() * 90, 1, 6);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
${parts.join('\n')}
</svg>
`;

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/wallpaper-doodles.svg');
writeFileSync(out, svg);
console.log(`wallpaper → ${out} (${parts.length} элементов)`);
