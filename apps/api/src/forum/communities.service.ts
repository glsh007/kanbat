import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE, type ForumCommunity, type Storage, type User } from '../store/types';
import {
  COMMUNITY_ICONS,
  DEFAULT_SECTIONS,
  FALLBACK_SECTION,
  MAX_COMMUNITIES,
  MAX_PENDING_PER_USER,
} from './sections';
import { junkReason, normalizeSlug } from './text';

const now = () => new Date().toISOString();
const NAME_MIN = 3;
const NAME_MAX = 40;
const SLUG_MIN = 2;
const SLUG_MAX = 24;
const DESC_MIN = 10;
const DESC_MAX = 140;
const RESERVED = new Set(['все', 'all', 'review']);

export type CommunityDraftInput = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  icon?: unknown;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/**
 * Сообщества Бат-Форума (ТЗ v4.7): хранятся в данных. Специалист создаёт, меняет и архивирует;
 * сотрудник предлагает — предложение ждёт специалиста в «На проверке».
 */
@Injectable()
export class CommunitiesService {
  private ready: Promise<void> | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  /** Стартовые шесть сообществ — один раз, если их ещё нет в данных. */
  private ensure() {
    this.ready ??= (async () => {
      const have = new Set((await this.storage.listCommunities()).map((c) => c.id));
      for (const [i, s] of DEFAULT_SECTIONS.entries()) {
        if (have.has(s.id)) continue;
        await this.storage.saveCommunity({
          ...s,
          status: 'active',
          builtin: true,
          // стартовые — в заданном порядке
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          createdById: 'system',
          createdByName: 'Бат-Форум',
        });
      }
    })();
    return this.ready;
  }

  async all(): Promise<ForumCommunity[]> {
    await this.ensure();
    return this.storage.listCommunities();
  }

  /** Активные сообщества по порядку: стартовые, затем новые, «Другое» — последним. */
  async active(): Promise<ForumCommunity[]> {
    const list = (await this.all()).filter((c) => c.status === 'active');
    const rank = (c: ForumCommunity) => (c.id === FALLBACK_SECTION ? 2 : c.builtin ? 0 : 1);
    return list.sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  }

  async isActive(id: unknown): Promise<boolean> {
    return typeof id === 'string' && (await this.active()).some((c) => c.id === id);
  }

  async get(id: string) {
    const c = (await this.all()).find((x) => x.id === id);
    if (!c) throw new NotFoundException('Сообщество не найдено');
    return c;
  }

  /** Проверка полей формы; exceptId — само сообщество при изменении. */
  private async validate(raw: CommunityDraftInput, exceptId?: string) {
    const name = str(raw?.name);
    const description = str(raw?.description);
    const slug = normalizeSlug(str(raw?.slug) || name);
    const icon = COMMUNITY_ICONS.includes(raw?.icon as never) ? (raw.icon as string) : 'help';
    if (name.length < NAME_MIN) throw new BadRequestException('Название — хотя бы 3 символа');
    if (name.length > NAME_MAX)
      throw new BadRequestException(`Название — не длиннее ${NAME_MAX} символов`);
    const junk = junkReason(name, 'name') ?? junkReason(description, 'body');
    if (junk) throw new BadRequestException(junk);
    if (slug.length < SLUG_MIN || slug.length > SLUG_MAX)
      throw new BadRequestException(
        `Адрес б/… — от ${SLUG_MIN} до ${SLUG_MAX} букв, цифр или дефисов`,
      );
    if (RESERVED.has(slug)) throw new BadRequestException(`Адрес «б/${slug}» занят`);
    if (description.length < DESC_MIN)
      throw new BadRequestException('Опишите в паре слов, о чём сообщество');
    if (description.length > DESC_MAX)
      throw new BadRequestException(`Описание — не длиннее ${DESC_MAX} символов`);
    // повторы — среди действующих и ждущих одобрения
    const live = (await this.all()).filter(
      (c) => c.id !== exceptId && (c.status === 'active' || c.status === 'proposed'),
    );
    const clash = live.find((c) => c.slug === slug);
    if (clash)
      throw new BadRequestException(
        clash.status === 'proposed'
          ? `Сообщество б/${slug} уже предложили — ждёт специалиста`
          : `Сообщество б/${slug} уже есть`,
      );
    if (live.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      throw new BadRequestException(`Сообщество «${name}» уже есть`);
    return { name, slug, description, icon };
  }

  private async checkRoom() {
    if ((await this.active()).length >= MAX_COMMUNITIES)
      throw new BadRequestException(
        `Сообществ уже ${MAX_COMMUNITIES} — объедините или архивируйте старые`,
      );
  }

  /** Специалист — создаёт сразу; сотрудник — предлагает. */
  async create(me: User, raw: CommunityDraftInput): Promise<ForumCommunity> {
    const fields = await this.validate(raw);
    const specialist = me.role === 'specialist';
    if (specialist) await this.checkRoom();
    else {
      const pending = (await this.all()).filter(
        (c) => c.createdById === me.id && c.status === 'proposed',
      );
      if (pending.length >= MAX_PENDING_PER_USER)
        throw new BadRequestException(
          `У вас уже ${MAX_PENDING_PER_USER} предложения ждут специалиста — дождитесь ответа`,
        );
    }
    return this.storage.saveCommunity({
      id: `c${randomUUID().replace(/-/g, '').slice(0, 10)}`,
      ...fields,
      status: specialist ? 'active' : 'proposed',
      builtin: false,
      createdAt: now(),
      createdById: me.id,
      createdByName: me.name,
      ...(specialist ? { decidedByName: me.name, decidedAt: now() } : {}),
    });
  }

  private specialist(me: User, what: string) {
    if (me.role !== 'specialist') throw new ForbiddenException(`${what} — только специалисты`);
  }

  async update(me: User, id: string, raw: CommunityDraftInput) {
    this.specialist(me, 'Менять сообщества');
    const c = await this.get(id);
    if (c.status !== 'active') throw new BadRequestException('Сообщество не активно');
    return this.storage.saveCommunity({ ...c, ...(await this.validate(raw, id)) });
  }

  /** В архив; темы переносит ForumService (в «Другое»). */
  async archive(me: User, id: string) {
    this.specialist(me, 'Архивировать сообщества');
    const c = await this.get(id);
    if (c.id === FALLBACK_SECTION)
      throw new BadRequestException('«Другое» нельзя архивировать: сюда переезжают темы');
    if (c.status !== 'active') throw new BadRequestException('Сообщество уже не активно');
    return this.storage.saveCommunity({
      ...c,
      status: 'archived',
      decidedByName: me.name,
      decidedAt: now(),
    });
  }

  /** Одобрить предложение; специалист может сразу поправить поля. */
  async approve(me: User, id: string, raw: CommunityDraftInput) {
    this.specialist(me, 'Одобрять сообщества');
    const c = await this.get(id);
    if (c.status !== 'proposed') throw new BadRequestException('Это предложение уже рассмотрено');
    await this.checkRoom();
    const fields = await this.validate(
      {
        name: raw?.name ?? c.name,
        slug: raw?.slug ?? c.slug,
        description: raw?.description ?? c.description,
        icon: raw?.icon ?? c.icon,
      },
      id,
    );
    return this.storage.saveCommunity({
      ...c,
      ...fields,
      status: 'active',
      decidedByName: me.name,
      decidedAt: now(),
    });
  }

  async reject(me: User, id: string, noteRaw: unknown) {
    this.specialist(me, 'Отклонять сообщества');
    const c = await this.get(id);
    if (c.status !== 'proposed') throw new BadRequestException('Это предложение уже рассмотрено');
    const note = str(noteRaw).slice(0, 200);
    return this.storage.saveCommunity({
      ...c,
      status: 'rejected',
      decidedByName: me.name,
      decidedAt: now(),
      ...(note ? { note } : {}),
    });
  }

  /** Специалисту — все ждущие; сотруднику — свои (последние 10, с решением). */
  async proposals(me: User): Promise<ForumCommunity[]> {
    const list = (await this.all()).filter((c) => !c.builtin);
    if (me.role === 'specialist')
      return list
        .filter((c) => c.status === 'proposed')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list
      .filter((c) => c.createdById === me.id && c.status !== 'active' && c.status !== 'archived')
      .concat(
        // одобренные тоже показываем недолго — чтобы человек увидел «Одобрено»
        list.filter(
          (c) =>
            c.createdById === me.id &&
            c.status === 'active' &&
            !!c.decidedAt &&
            Date.now() - new Date(c.decidedAt).getTime() < 7 * 86_400_000 &&
            c.decidedByName !== me.name,
        ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  }
}
