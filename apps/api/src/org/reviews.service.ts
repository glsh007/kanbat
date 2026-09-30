import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE, type Storage, type User } from '../store/types';
import { cleanReview, REVIEW_LIMITS, type ErrorReview } from './reviews';

const KEY = 'errorReviews';
const DAY = 24 * 3_600_000;

/** Разбор ошибок (ТЗ v4.29): присланные на разбор ответы; хранятся последние 200. */
@Injectable()
export class ReviewsService {
  private cache: ErrorReview[] | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  async list(): Promise<ErrorReview[]> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse((await this.storage.getMeta(KEY)) ?? '[]') as unknown;
      this.cache = Array.isArray(raw) ? (raw as ErrorReview[]) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(list: ErrorReview[]) {
    this.cache = list.slice(-REVIEW_LIMITS.keep);
    await this.storage.setMeta(KEY, JSON.stringify(this.cache));
  }

  async add(raw: unknown, by: User): Promise<{ ok: true }> {
    const list = await this.list();
    const since = Date.now() - DAY;
    const mine = list.filter((r) => r.from === by.id && Date.parse(r.createdAt) > since).length;
    if (mine >= REVIEW_LIMITS.perUserPerDay)
      throw new HttpException(
        'Сегодня уже отправлено много ответов — спасибо!',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const r: ErrorReview = {
      id: randomUUID(),
      ...cleanReview(raw),
      status: 'new',
      outcome: null,
      createdAt: new Date().toISOString(),
      from: by.id,
    };
    await this.save([...list, r]);
    return { ok: true };
  }

  async resolve(id: string, outcome: unknown): Promise<ErrorReview> {
    const list = await this.list();
    const r = list.find((x) => x.id === id);
    if (!r) throw new NotFoundException('Ответ на разбор не найден');
    const o = ['check', 'sample', 'rule', 'closed'].includes(outcome as string)
      ? (outcome as ErrorReview['outcome'])
      : null;
    if (!o) throw new BadRequestException('Неизвестное действие');
    const next: ErrorReview = { ...r, status: 'done', outcome: o };
    await this.save(list.map((x) => (x.id === id ? next : x)));
    return next;
  }
}
