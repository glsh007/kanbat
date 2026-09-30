import { Inject, Injectable } from '@nestjs/common';
import { STORAGE, type Storage, type User } from '../store/types';
import { cleanRules, EMPTY_RULES, fired, type FiredRule, type OrgRules } from './rules';

const KEY = 'orgRules';

/** Жёсткие правила организации (ТЗ v4.26): хранятся в служебных данных, как профиль. */
@Injectable()
export class RulesService {
  private cache: OrgRules | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  async get(): Promise<OrgRules> {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse((await this.storage.getMeta(KEY)) ?? 'null') as OrgRules | null;
      this.cache = raw && Array.isArray(raw.rules) ? raw : { ...EMPTY_RULES };
    } catch {
      console.warn('Жёсткие правила повреждены — работаю без них');
      this.cache = { ...EMPTY_RULES };
    }
    return this.cache;
  }

  async save(raw: unknown, by: User): Promise<OrgRules> {
    const next: OrgRules = {
      ...cleanRules(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.storage.setMeta(KEY, JSON.stringify(next));
    this.cache = next;
    return next;
  }

  async fired(text: string): Promise<FiredRule[]> {
    return fired(text, (await this.get()).rules);
  }

  async forbidden(): Promise<string[]> {
    return (await this.get()).forbidden;
  }
}
