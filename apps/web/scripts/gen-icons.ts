/**
 * Генерирует favicon.svg и PNG-иконки (16/32/180/512 + maskable) из геометрии знака
 * (src/brand/markGeometry.ts). Запуск: npm run icons -w @app/web
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { palette } from '@app/tokens';
import sharp from 'sharp';
import { markInnerSvg, MARK_VIEWBOX } from '../src/brand/markGeometry';

const [vbX, vbY, vbSize] = MARK_VIEWBOX.split(' ').map(Number) as [number, number, number];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const iconsDir = resolve(pub, 'icons');
mkdirSync(iconsDir, { recursive: true });

/** Плитка: фон — графит, мышь — крем, перекладина — терракота. `scale` — доля знака от стороны. */
function tileSvg(size: number, scale: number, radiusRatio: number): string {
  const markSize = size * scale;
  const offset = (size - markSize) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radiusRatio}" fill="${palette.slate}"/>
  <svg x="${offset}" y="${offset}" width="${markSize}" height="${markSize}" viewBox="${MARK_VIEWBOX}">${markInnerSvg(palette.cream, palette.clay)}</svg>
</svg>`;
}

/** favicon.svg: цвета как в светлой теме; в тёмной теме браузера мышь — кремовая. */
function faviconSvg(): string {
  // временные «цвета-метки» заменяем на классы, чтобы цвет переключался медиа-запросом
  const inner = markInnerSvg('#000001', '#000002')
    .replaceAll('fill="#000001"', 'class="p"')
    .replaceAll('fill="#000002"', 'class="a"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbSize} ${vbSize}">
  <style>
    .p { fill: ${palette.ink}; } .a { fill: ${palette.clay}; }
    @media (prefers-color-scheme: dark) { .p { fill: ${palette.cream}; } }
  </style>
  ${inner}
</svg>
`;
}

const targets: { file: string; size: number; scale: number; radius: number }[] = [
  { file: 'icon-16.png', size: 16, scale: 0.9, radius: 0.22 },
  { file: 'icon-32.png', size: 32, scale: 0.86, radius: 0.22 },
  // iOS сам скругляет углы — квадрат без радиуса
  { file: 'icon-180.png', size: 180, scale: 0.66, radius: 0 },
  { file: 'icon-512.png', size: 512, scale: 0.7, radius: 0.22 },
  // maskable: знак внутри безопасной зоны (80% диаметра)
  { file: 'icon-maskable-512.png', size: 512, scale: 0.52, radius: 0 },
];

writeFileSync(resolve(pub, 'favicon.svg'), faviconSvg(), 'utf8');

for (const t of targets) {
  const svg = Buffer.from(tileSvg(t.size, t.scale, t.radius));
  await sharp(svg, { density: 384 }).resize(t.size, t.size).png().toFile(resolve(iconsDir, t.file));
  console.log(`icons/${t.file}`);
}
console.log('favicon.svg');
