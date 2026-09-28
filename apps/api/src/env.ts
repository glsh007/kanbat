import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Настройки сервера из apps/api/.env (если файл есть). Переменные, уже заданные в окружении,
 * не перезаписываются. Пример — .env.example.
 */
const file = join(__dirname, '..', '.env');
if (existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn(`Не удалось прочитать ${file}:`, e);
  }
}
