import { checkContrast } from '../src/contrast';

const results = checkContrast();
const failed = results.filter((r) => !r.pass);
const verbose = process.argv.includes('--all');

// по умолчанию — только проблемы и итог по схемам (пар много: схемы × темы)
for (const r of verbose ? results : failed) {
  const mark = r.pass ? 'OK  ' : 'FAIL';
  const pair = `${r.fg} на ${r.bg}${r.over ? ` (поверх ${r.over})` : ''}`;
  console.log(
    `${mark} [${r.scheme}/${r.theme.padEnd(5)}] ${r.ratio.toFixed(2).padStart(5)} ≥ ${r.min}  ${pair.padEnd(48)} ${r.note}`,
  );
}

const schemes = [...new Set(results.map((r) => r.scheme))];
for (const sc of schemes) {
  const own = results.filter((r) => r.scheme === sc);
  const worst = own.reduce((m, r) => (r.ratio / r.min < m.ratio / m.min ? r : m));
  console.log(
    `${sc.padEnd(11)} ${own.filter((r) => !r.pass).length ? 'FAIL' : 'OK  '} худшее: ${worst.ratio} ≥ ${worst.min} (${worst.theme}, ${worst.note})`,
  );
}
console.log(`\nПроверено пар: ${results.length}, не прошло: ${failed.length}`);
if (failed.length > 0) process.exit(1);
