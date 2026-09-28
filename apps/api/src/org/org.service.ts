import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { STORAGE, type Storage, type User } from '../store/types';
import { buildBase, cleanProfile, DEFAULT_PROFILE, type OrgProfile } from './profile';

const KEY = 'orgProfile';

/**
 * Профиль организации (ТЗ v4.12). Один на сервер («одна организация — один сервер»),
 * хранится в служебных данных. Пока администратор его не сохранил — роль по умолчанию
 * (универсальный помощник поддержки, ТЗ v4.13).
 */
@Injectable()
export class OrgService implements OnModuleInit {
  private profile: OrgProfile | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  async onModuleInit() {
    const raw = await this.storage.getMeta(KEY);
    if (!raw) return;
    try {
      this.profile = { ...cleanProfile(JSON.parse(raw)), ...pickMeta(JSON.parse(raw)) };
    } catch {
      console.warn('Профиль организации повреждён — работаю без него');
    }
  }

  get(): OrgProfile | null {
    return this.profile;
  }

  /** Для сотрудников и экрана входа: только имя помощника и организации. */
  publicInfo() {
    return {
      configured: !!this.profile,
      orgName: this.profile?.orgName ?? '',
      assistantName: this.profile?.assistantName ?? '',
    };
  }

  async save(raw: unknown, by: User): Promise<OrgProfile> {
    const profile: OrgProfile = {
      ...cleanProfile(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.storage.setMeta(KEY, JSON.stringify(profile));
    this.profile = profile;
    return profile;
  }

  /**
   * Единая базовая инструкция помощника (ТЗ v4.13): по профилю организации или по роли
   * по умолчанию. `draft` — черновик из «Проверить на вопросе».
   */
  base(draft?: OrgProfile): string {
    return buildBase(draft ?? this.profile ?? DEFAULT_PROFILE);
  }

  /** Фраза в конце ответа (добавляет сервер — модель могла бы её забыть или переиначить). */
  signature(profile: OrgProfile | null = this.profile): string {
    return profile?.signature ?? '';
  }
}

function pickMeta(r: Partial<OrgProfile>) {
  return {
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : undefined,
  };
}
