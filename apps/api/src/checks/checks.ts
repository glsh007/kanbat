import { BadRequestException } from '@nestjs/common';
import { maskPersonalData } from '../common/pii';
import { phraseIn } from '../org/answers';
import type { OrgTemplateId } from '../org/profile';
import type { TriageRoute } from '../llm/types';

/**
 * Проверочные вопросы (ТЗ v4.27, п. 17, шаг 3): типичные обращения с ожиданиями. «Прогнать» проверяет
 * их на настоящей модели тем же путём, что и живое обращение, и показывает, где помощник ответил не так.
 */
export type ExpectRoute = TriageRoute | 'any';

export interface CheckExpect {
  /** Что сделает помощник; any — не важно. */
  route: ExpectRoute;
  /** Для route = canned: какой готовый ответ ('' — любой). */
  cannedId: string;
  /** Должно быть в ответе — фразы, слова в любой форме. */
  has: string[];
  /** Не должно быть в ответе. */
  hasNot: string[];
  urgent: 'any' | 'yes' | 'no';
  /** Сервис в разборе содержит это ('' — не важно). */
  service: string;
}

export interface CheckQuestion {
  id: string;
  text: string;
  expect: CheckExpect;
  updatedAt: string;
  updatedBy: string;
}

export const CHECK_LIMITS = {
  questions: 30,
  text: 500,
  phrases: 10,
  phrase: 80,
  service: 60,
} as const;

export const ROUTE_LABELS: Record<TriageRoute, string> = {
  answer: 'ответит сам',
  canned: 'покажет готовый ответ',
  specialist: 'предложит специалиста',
  clarify: 'задаст уточняющие вопросы',
  describe: 'поддержит разговор — обращения нет',
};

const ROUTES: ExpectRoute[] = ['any', 'answer', 'canned', 'specialist', 'clarify', 'describe'];

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\r/g, '').trim() : '');

function phrases(v: unknown, field: string): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  const list = [
    ...new Set(
      raw.map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '')).filter(Boolean),
    ),
  ];
  if (list.length > CHECK_LIMITS.phrases)
    throw new BadRequestException(`${field}: не больше ${CHECK_LIMITS.phrases}`);
  if (list.some((x) => x.length > CHECK_LIMITS.phrase))
    throw new BadRequestException(`${field}: каждая — не длиннее ${CHECK_LIMITS.phrase} символов`);
  return list;
}

export function cleanCheck(raw: unknown): Pick<CheckQuestion, 'text' | 'expect'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = str(r.text);
  if (!text) throw new BadRequestException('Обращение: заполните');
  if (text.length > CHECK_LIMITS.text)
    throw new BadRequestException(`Обращение: не длиннее ${CHECK_LIMITS.text} символов`);
  const e = (r.expect && typeof r.expect === 'object' ? r.expect : {}) as Record<string, unknown>;
  const route = ROUTES.includes(e.route as ExpectRoute) ? (e.route as ExpectRoute) : 'any';
  const service = str(e.service);
  if (service.length > CHECK_LIMITS.service)
    throw new BadRequestException(`Сервис: не длиннее ${CHECK_LIMITS.service} символов`);
  const has = phrases(e.has, 'Должно быть в ответе');
  const hasNot = phrases(e.hasNot, 'Не должно быть в ответе');
  const clash = has.find((h) => hasNot.some((n) => n.toLowerCase() === h.toLowerCase()));
  if (clash)
    throw new BadRequestException(`«${clash}» не может быть и «должно быть», и «не должно быть»`);
  return {
    // проверочный вопрос уходит модели — без личных данных
    text: maskPersonalData(text).text,
    expect: {
      route,
      cannedId: route === 'canned' ? str(e.cannedId).slice(0, 64) : '',
      has,
      hasNot,
      urgent: e.urgent === 'yes' || e.urgent === 'no' ? e.urgent : 'any',
      service,
    },
  };
}

// ——— Результат и проверки ———

export type CheckStatus = 'pass' | 'fail' | 'error' | 'unchecked';

export interface CheckItem {
  label: string;
  ok: boolean;
  /** Что вышло на самом деле, если не совпало. */
  detail?: string;
}

/** Что получилось на вопросе — как это увидит человек. */
export interface Observed {
  route: TriageRoute;
  canned: { id: string; title: string } | null;
  /** Текст, который увидит человек: ответ, готовый ответ, вопросы, предложение специалиста. */
  reply: string;
  urgency: string;
  service: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Фраза есть в тексте: все значимые слова в любой форме; короткие («ПО», «1С») — как есть. */
export function mentions(text: string, phrase: string): boolean {
  return phraseIn(text, phrase) || norm(text).includes(norm(phrase).trim());
}

export function evaluate(
  expect: CheckExpect,
  o: Observed,
  cannedTitle: (id: string) => string | null,
): CheckItem[] {
  const items: CheckItem[] = [];
  if (expect.route !== 'any') {
    const want =
      expect.route === 'canned' && expect.cannedId
        ? `покажет готовый ответ «${cannedTitle(expect.cannedId) ?? 'удалён'}»`
        : ROUTE_LABELS[expect.route];
    const ok =
      o.route === expect.route &&
      (expect.route !== 'canned' || !expect.cannedId || o.canned?.id === expect.cannedId);
    const got =
      o.route === 'canned' && o.canned
        ? `показал готовый ответ «${o.canned.title}»`
        : ROUTE_LABELS[o.route];
    items.push({ label: `Помощник ${want}`, ok, ...(ok ? {} : { detail: `вышло: ${got}` }) });
  }
  for (const p of expect.has)
    items.push({ label: `В ответе есть «${p}»`, ok: mentions(o.reply, p) });
  for (const p of expect.hasNot)
    items.push({ label: `В ответе нет «${p}»`, ok: !mentions(o.reply, p) });
  if (expect.urgent !== 'any') {
    const urgent = o.urgency === 'critical';
    const ok = expect.urgent === 'yes' ? urgent : !urgent;
    items.push({
      label: expect.urgent === 'yes' ? 'Срочно' : 'Не срочно',
      ok,
      ...(ok
        ? {}
        : { detail: urgent ? 'вышло: срочно' : `вышло: ${URGENCY[o.urgency] ?? o.urgency}` }),
    });
  }
  if (expect.service) {
    const ok = norm(o.service).includes(norm(expect.service));
    items.push({
      label: `Сервис «${expect.service}»`,
      ok,
      ...(ok ? {} : { detail: `вышло: «${o.service || '—'}»` }),
    });
  }
  return items;
}

const URGENCY: Record<string, string> = {
  critical: 'срочно',
  high: 'высокая',
  normal: 'обычная',
  low: 'низкая',
};

export const statusOf = (items: CheckItem[]): CheckStatus =>
  !items.length ? 'unchecked' : items.every((i) => i.ok) ? 'pass' : 'fail';

// ——— Примеры под шаблон отрасли ———

type Example = { text: string; expect: Partial<CheckExpect> };

const COMMON_END: Example = { text: 'Привет!', expect: { route: 'describe' } };

/** По 5 вопросов на шаблон: обычный вопрос, проблема, срочное, размытое, разговор без обращения. */
export const EXAMPLES: Record<OrgTemplateId, Example[]> = {
  it: [
    { text: 'Как сменить пароль от рабочей почты?', expect: { route: 'answer', has: ['пароль'] } },
    {
      text: 'Не приходит почта в Outlook с утра, в браузере письма есть',
      expect: { route: 'answer', has: ['Outlook'], hasNot: ['передано специалисту'] },
    },
    {
      text: 'Через 20 минут встреча, а ноутбук не подключается к Wi-Fi',
      expect: { urgent: 'yes' },
    },
    { text: 'Что-то с компьютером', expect: { route: 'clarify' } },
    COMMON_END,
  ],
  gov: [
    { text: 'Как записаться на приём?', expect: { has: ['запис'] } },
    {
      text: 'Какие документы нужны для замены паспорта в 45 лет?',
      expect: { route: 'answer', has: ['паспорт'] },
    },
    {
      text: 'Сегодня последний день подачи заявления, а сайт выдаёт ошибку',
      expect: { urgent: 'yes' },
    },
    { text: 'Не получается', expect: { route: 'clarify' } },
    COMMON_END,
  ],
  games: [
    { text: 'Как вернуть деньги за игру?', expect: { has: ['вернуть'] } },
    { text: 'Игра вылетает сразу после запуска', expect: { route: 'answer' } },
    {
      text: 'Мой аккаунт взломали и сменили почту',
      expect: { hasNot: ['передано специалисту'] },
    },
    { text: 'Не работает', expect: { route: 'clarify' } },
    COMMON_END,
  ],
  shop: [
    { text: 'Где мой заказ?', expect: { route: 'clarify' } },
    {
      text: 'Как вернуть товар, который не подошёл?',
      expect: { route: 'answer', has: ['вернуть'] },
    },
    { text: 'С карты списали деньги за заказ дважды', expect: { hasNot: ['гарантируем'] } },
    { text: 'Пришёл не тот размер', expect: { route: 'answer' } },
    COMMON_END,
  ],
  custom: [
    { text: 'Что вы умеете?', expect: { route: 'describe' } },
    { text: 'Как с вами связаться?', expect: { route: 'answer' } },
    { text: 'Срочно нужна помощь, всё сломалось', expect: { route: 'clarify' } },
    { text: 'Спасибо, всё получилось', expect: { route: 'describe' } },
    COMMON_END,
  ],
};

export const exampleExpect = (e: Partial<CheckExpect>): CheckExpect => ({
  route: 'any',
  cannedId: '',
  has: [],
  hasNot: [],
  urgent: 'any',
  service: '',
  ...e,
});
