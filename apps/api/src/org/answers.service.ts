import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE, type Storage, type User } from '../store/types';
import {
  ANSWER_LIMITS,
  candidates,
  cleanAnswer,
  strongMatch,
  type CannedAnswer,
  type Candidate,
} from './answers';

const KEY = 'cannedAnswers';

/**
 * Готовые ответы организации (ТЗ v4.25). Один список на сервер, хранится в служебных данных,
 * как профиль организации. Меняет только администратор; подбор и отзывы — для всех.
 */
@Injectable()
export class AnswersService {
  private cache: CannedAnswer[] | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  async list(): Promise<CannedAnswer[]> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse((await this.storage.getMeta(KEY)) ?? '[]') as unknown;
      this.cache = Array.isArray(raw) ? (raw as CannedAnswer[]) : [];
    } catch {
      console.warn('Готовые ответы повреждены — работаю без них');
      this.cache = [];
    }
    return this.cache;
  }

  private async save(list: CannedAnswer[]) {
    this.cache = list;
    await this.storage.setMeta(KEY, JSON.stringify(list));
  }

  async create(raw: unknown, by: User): Promise<CannedAnswer> {
    const list = await this.list();
    if (list.length >= ANSWER_LIMITS.answers)
      throw new BadRequestException(`Готовых ответов — не больше ${ANSWER_LIMITS.answers}`);
    const a: CannedAnswer = {
      id: randomUUID(),
      ...cleanAnswer(raw),
      shown: 0,
      notHelped: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.save([...list, a]);
    return a;
  }

  async update(id: string, raw: unknown, by: User): Promise<CannedAnswer> {
    const list = await this.list();
    const prev = list.find((a) => a.id === id);
    if (!prev) throw new NotFoundException('Готовый ответ не найден');
    const next: CannedAnswer = {
      ...prev,
      ...cleanAnswer(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.save(list.map((a) => (a.id === id ? next : a)));
    return next;
  }

  async remove(id: string) {
    const list = await this.list();
    if (!list.some((a) => a.id === id)) throw new NotFoundException('Готовый ответ не найден');
    await this.save(list.filter((a) => a.id !== id));
    return { ok: true };
  }

  async get(id: string): Promise<CannedAnswer | null> {
    return (await this.list()).find((a) => a.id === id) ?? null;
  }

  async candidates(text: string, limit = 3): Promise<Candidate[]> {
    return candidates(text, await this.list(), limit);
  }

  async strong(text: string): Promise<CannedAnswer | null> {
    return strongMatch(text, await this.list());
  }

  /** Статистика: показан / «Не помогло». */
  async count(id: string, field: 'shown' | 'notHelped') {
    const list = await this.list();
    if (!list.some((a) => a.id === id)) return;
    await this.save(list.map((a) => (a.id === id ? { ...a, [field]: (a[field] ?? 0) + 1 } : a)));
  }
}
