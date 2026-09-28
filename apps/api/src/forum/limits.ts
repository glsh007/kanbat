import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Скользящее окно «не больше N действий за T» по ключу (id пользователя) — от флуда на БатФоруме.
 * Хранится в памяти: после перезапуска сервера счёт начинается заново, для лимитов этого хватает.
 */
export class RateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly what: string,
  ) {}

  /** Бросает 429, если лимит исчерпан; иначе засчитывает действие. */
  take(key: string, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      const waitMin = Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 60_000));
      throw new HttpException(
        `Слишком много ${this.what} подряд — попробуйте через ${waitMin} мин.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
  }
}
