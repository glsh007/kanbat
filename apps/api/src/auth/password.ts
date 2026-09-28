import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Пароли личных кабинетов. Храним только соль и хэш scrypt (медленная функция: перебор по
 * украденному файлу данных дорог). Формат строки: `scrypt$N$соль$хэш` (base64).
 */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 100;

const N = 16384;
const KEYLEN = 32;

function scrypt(password: string, salt: Buffer, n: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n));
  return want.length === key.length && timingSafeEqual(want, key);
}

/**
 * Счётчик неудачных попыток (перебор пароля или кода специалиста): по ключу (адрес, кабинет)
 * и всего. Окно — 10 минут; при превышении вход закрыт, пока старые попытки не «остынут».
 */
export class AttemptGuard {
  private readonly fails = new Map<string, number[]>();
  private global: number[] = [];

  constructor(
    private readonly perKey: number,
    private readonly total: number,
    private readonly windowMs = 10 * 60_000,
  ) {}

  private recent(list: number[] = []) {
    const since = Date.now() - this.windowMs;
    return list.filter((t) => t > since);
  }

  blocked(...keys: string[]): boolean {
    this.global = this.recent(this.global);
    if (this.global.length >= this.total) return true;
    return keys.some((k) => {
      const mine = this.recent(this.fails.get(k));
      this.fails.set(k, mine);
      return mine.length >= this.perKey;
    });
  }

  fail(...keys: string[]) {
    const now = Date.now();
    this.global.push(now);
    for (const k of keys) this.fails.set(k, [...this.recent(this.fails.get(k)), now]);
    // не копим память: остывшие ключи выбрасываем
    if (this.fails.size > 5000)
      for (const [k, v] of this.fails) if (!this.recent(v).length) this.fails.delete(k);
  }
}
