import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTokensCss } from '../src/css';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../tokens.css');
writeFileSync(out, buildTokensCss(), 'utf8');
console.log(`tokens.css → ${out}`);
