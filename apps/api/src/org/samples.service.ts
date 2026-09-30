import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE, type Storage, type User } from '../store/types';
import { cleanSample, pickSamples, SAMPLE_LIMITS, type AnswerSample } from './samples';

const KEY = 'answerSamples';

/** Образцы ответов (ТЗ v4.27): один список на сервер, в служебных данных; меняет администратор. */
@Injectable()
export class SamplesService {
  private cache: AnswerSample[] | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  async list(): Promise<AnswerSample[]> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse((await this.storage.getMeta(KEY)) ?? '[]') as unknown;
      this.cache = Array.isArray(raw) ? (raw as AnswerSample[]) : [];
    } catch {
      console.warn('Образцы ответов повреждены — работаю без них');
      this.cache = [];
    }
    return this.cache;
  }

  private async save(list: AnswerSample[]) {
    this.cache = list;
    await this.storage.setMeta(KEY, JSON.stringify(list));
  }

  async create(raw: unknown, by: User): Promise<AnswerSample> {
    const list = await this.list();
    if (list.length >= SAMPLE_LIMITS.samples)
      throw new BadRequestException(`Образцов — не больше ${SAMPLE_LIMITS.samples}`);
    const s: AnswerSample = {
      id: randomUUID(),
      ...cleanSample(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.save([...list, s]);
    return s;
  }

  async update(id: string, raw: unknown, by: User): Promise<AnswerSample> {
    const list = await this.list();
    const prev = list.find((s) => s.id === id);
    if (!prev) throw new NotFoundException('Образец не найден');
    const next: AnswerSample = {
      ...prev,
      ...cleanSample(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.save(list.map((s) => (s.id === id ? next : s)));
    return next;
  }

  async remove(id: string) {
    const list = await this.list();
    if (!list.some((s) => s.id === id)) throw new NotFoundException('Образец не найден');
    await this.save(list.filter((s) => s.id !== id));
    return { ok: true };
  }

  /** До 2 самых похожих на обращение включённых образцов. */
  async pick(query: string): Promise<AnswerSample[]> {
    return pickSamples(query, await this.list());
  }
}
