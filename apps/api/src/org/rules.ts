import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { phraseIn } from './answers';

/**
 * Жёсткие правила организации (ТЗ v4.26, п. 17, шаг 2). Их выполняет сервер — они сильнее мнения
 * модели: фразы в обращении → срочно / сразу к специалисту / трудная задача / сервис; фразы, которых
 * не должно быть в ответах ИИ, — предложение с ними убирается до того, как его увидит человек.
 */
export type RuleAction = 'urgent' | 'specialist' | 'hard' | 'service';

export interface HardRule {
  id: string;
  /** Фразы: «не работает касса», «сломался терминал». Слова — в любой форме. */
  phrases: string[];
  action: RuleAction;
  /** Для «Сервис»: что писать в поле «Сервис». */
  service: string;
  /** Для «Сразу к специалисту»: что сказать человеку (необязательно). */
  note: string;
  enabled: boolean;
}

export interface OrgRules {
  rules: HardRule[];
  /** Запрещено в ответах ИИ: «гарантируем», «бесплатно», названия конкурентов. */
  forbidden: string[];
  updatedAt?: string;
  updatedBy?: string;
}

/** Какое правило сработало — для разбора, сводки специалисту и «Проверить». */
export interface FiredRule {
  id: string;
  action: RuleAction;
  phrase: string;
  service?: string;
  note?: string;
}

export const RULE_LIMITS = {
  rules: 50,
  phrases: 20,
  phrase: 80,
  service: 60,
  note: 300,
  forbidden: 50,
  forbiddenPhrase: 60,
} as const;

const ACTIONS: RuleAction[] = ['urgent', 'specialist', 'hard', 'service'];
export const EMPTY_RULES: OrgRules = { rules: [], forbidden: [] };

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\r/g, '').trim() : '');

function phrasesOf(v: unknown, field: string, max: number, each: number): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n/) : [];
  const list = [
    ...new Set(
      raw.map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '')).filter(Boolean),
    ),
  ];
  if (list.length > max) throw new BadRequestException(`${field}: не больше ${max}`);
  if (list.some((x) => x.length > each))
    throw new BadRequestException(`${field}: каждая — не длиннее ${each} символов`);
  return list;
}

export function cleanRules(raw: unknown): Pick<OrgRules, 'rules' | 'forbidden'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.rules) ? r.rules : [];
  if (list.length > RULE_LIMITS.rules)
    throw new BadRequestException(`Правил — не больше ${RULE_LIMITS.rules}`);
  const rules = list.map((x, i): HardRule => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const n = i + 1;
    const phrases = phrasesOf(
      o.phrases,
      `Правило ${n}, фразы`,
      RULE_LIMITS.phrases,
      RULE_LIMITS.phrase,
    );
    if (!phrases.length) throw new BadRequestException(`Правило ${n}: добавьте хотя бы одну фразу`);
    const action = ACTIONS.includes(o.action as RuleAction) ? (o.action as RuleAction) : null;
    if (!action) throw new BadRequestException(`Правило ${n}: выберите, что делать`);
    const service = str(o.service).slice(0, RULE_LIMITS.service);
    if (action === 'service' && !service)
      throw new BadRequestException(`Правило ${n}: напишите название сервиса`);
    const note = str(o.note);
    if (note.length > RULE_LIMITS.note)
      throw new BadRequestException(
        `Правило ${n}: пояснение — не длиннее ${RULE_LIMITS.note} символов`,
      );
    return {
      id: typeof o.id === 'string' && /^[\w-]{1,64}$/.test(o.id) ? o.id : randomUUID(),
      phrases,
      action,
      service: action === 'service' ? service : '',
      note: action === 'specialist' ? note : '',
      enabled: o.enabled !== false,
    };
  });
  const forbidden = phrasesOf(
    r.forbidden,
    'Запрещённые фразы',
    RULE_LIMITS.forbidden,
    RULE_LIMITS.forbiddenPhrase,
  );
  return { rules, forbidden };
}

/** Какие правила срабатывают на обращение (включённые; у каждого — первая найденная фраза). */
export function fired(text: string, rules: HardRule[]): FiredRule[] {
  const out: FiredRule[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const phrase = r.phrases.find((p) => phraseIn(text, p));
    if (!phrase) continue;
    out.push({
      id: r.id,
      action: r.action,
      phrase,
      ...(r.action === 'service' ? { service: r.service } : {}),
      ...(r.action === 'specialist' && r.note ? { note: r.note } : {}),
    });
  }
  return out;
}

// ——— Запрещённое в ответах ———

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Какие запрещённые фразы есть в тексте — по началу слова («бесплатно» не ловит «небесплатно»). */
export function forbiddenIn(text: string, forbidden: string[]): string[] {
  const t = norm(text);
  return forbidden.filter((f) => {
    const p = norm(f).trim();
    if (!p) return false;
    for (let j = t.indexOf(p); j >= 0; j = t.indexOf(p, j + 1)) {
      const before = j === 0 ? '' : t[j - 1]!;
      if (!/[a-zа-я0-9]/.test(before)) return true;
    }
    return false;
  });
}

/** Предложение (или строка списка) содержит запрещённую фразу. */
const hasForbidden = (sentence: string, forbidden: string[]) =>
  forbiddenIn(sentence, forbidden).length > 0;

/** Убрать предложения с запрещёнными фразами. Строки Markdown (пункты списка) — как предложения. */
export function censor(text: string, forbidden: string[]): string {
  if (!forbidden.length || !text) return text;
  const parts = text.match(/[^.!?…\n]*(?:[.!?…]+["»)]*[ \t]*|\n|$)/g) ?? [text];
  const kept = parts.filter((p) => !hasForbidden(p, forbidden));
  if (kept.length === parts.length) return text;
  return (
    kept
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // пункт списка, от которого остался только номер, — убираем вместе со строкой
      .replace(/^[ \t]*(?:[-*]|\d+[.)])[ \t]*(?:\n|$)/gm, '')
      .replace(/\n{3,}/g, '\n\n')
  );
}

/** Длина самой длинной запрещённой фразы. */
export const holdFor = (forbidden: string[]) =>
  forbidden.reduce((m, f) => Math.max(m, f.length), 0);

/** Конец последнего законченного предложения (или строки) в тексте; 0 — ни одного. */
function lastBoundary(text: string): number {
  let end = 0;
  for (const m of text.matchAll(/[.!?…]+["»)]*[ \t]+|\n/g)) {
    // «2. » в начале строки — номер пункта списка, а не конец предложения
    const line = text.slice(text.lastIndexOf('\n', m.index! - 1) + 1, m.index);
    if (m[0] !== '\n' && /^[ \t]*\d+$/.test(line)) continue;
    end = m.index! + m[0].length;
  }
  return end;
}

/** Если предложение не кончается так долго — показываем, придерживая только хвост. */
const LONG_SENTENCE = 400;

/**
 * Ответ ИИ по ходу написания (ТЗ v4.26): пока есть запрещённые фразы, человек видит ответ
 * по законченным предложениям — предложение с запрещённой фразой убирается до того, как его покажут.
 * Предложение без конца длиннее LONG_SENTENCE показываем раньше, придерживая хвост длиной с самую
 * длинную фразу; если потом убрать пришлось уже показанное — `reset` (весь текст заново).
 */
export class CensorStream {
  private sent = '';
  private readonly hold: number;

  constructor(private readonly forbidden: string[]) {
    this.hold = holdFor(forbidden);
  }

  /** raw — весь текст ответа на сейчас; final — ответ закончен. */
  next(raw: string, final: boolean): { delta: string; reset: string | null } {
    let cut = raw;
    if (!final && this.forbidden.length) {
      const b = lastBoundary(raw);
      cut = raw.length - b > LONG_SENTENCE ? raw.slice(0, raw.length - this.hold) : raw.slice(0, b);
    }
    const visible = censor(cut, this.forbidden);
    if (visible.startsWith(this.sent)) {
      const delta = visible.slice(this.sent.length);
      this.sent = visible;
      return { delta, reset: null };
    }
    this.sent = visible;
    return { delta: '', reset: visible };
  }

  get text(): string {
    return this.sent;
  }
}
