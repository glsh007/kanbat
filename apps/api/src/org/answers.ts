import { BadRequestException } from '@nestjs/common';
import { maskPersonalData } from '../common/pii';

/**
 * Готовые ответы организации (ТЗ v4.25, п. 17): администратор задаёт ответ на ключевые слова —
 * текст (можно планом по шагам и со ссылками) и кнопки-ссылки. Ответ показывается дословно,
 * только если подходит по смыслу: сначала сервер отбирает кандидатов по словам, потом решает модель.
 */
export interface CannedLink {
  label: string;
  url: string;
}

export interface CannedAnswer {
  id: string;
  title: string;
  /** Ключевые слова и фразы: «запись к врачу», «записаться на приём». */
  keywords: string[];
  /** Для модели: когда ответ подходит и когда нет. */
  when: string;
  /** Текст ответа (Markdown): шаги — нумерованным списком, ссылки — [текст](https://…). */
  body: string;
  links: CannedLink[];
  enabled: boolean;
  /** Сколько раз показан и сколько раз «Не помогло». */
  shown: number;
  notHelped: number;
  updatedAt: string;
  updatedBy: string;
}

/** То, что уходит в чат человека. */
export interface CannedView {
  id: string;
  title: string;
  body: string;
  links: CannedLink[];
}

export const ANSWER_LIMITS = {
  answers: 100,
  title: 80,
  keywords: 20,
  keyword: 60,
  when: 300,
  body: 4000,
  links: 5,
  linkLabel: 60,
  url: 500,
} as const;

const isUrl = (u: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u);

function text(v: unknown, max: number, field: string, required = false): string {
  const s = typeof v === 'string' ? v.replace(/\r/g, '').trim() : '';
  if (required && !s) throw new BadRequestException(`${field}: заполните`);
  if (s.length > max) throw new BadRequestException(`${field}: не длиннее ${max} символов`);
  return s;
}

/** Ссылки в тексте — только http(s): «[текст](javascript:…)» превращается в просто текст. */
export function safeLinks(body: string): string {
  return body.replace(
    /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g,
    (m, label: string, url: string) => (isUrl(url) ? m : label),
  );
}

export function cleanAnswer(
  raw: unknown,
): Pick<CannedAnswer, 'title' | 'keywords' | 'when' | 'body' | 'links' | 'enabled'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = text(r.title, ANSWER_LIMITS.title, 'Название', true);
  const keywordsRaw = Array.isArray(r.keywords)
    ? r.keywords
    : typeof r.keywords === 'string'
      ? r.keywords.split(/[\n,;]/)
      : [];
  const keywords = [
    ...new Set(
      keywordsRaw
        .map((k) => (typeof k === 'string' ? k.trim().replace(/\s+/g, ' ') : ''))
        .filter(Boolean),
    ),
  ];
  if (!keywords.length) throw new BadRequestException('Ключевые слова: добавьте хотя бы одно');
  if (keywords.length > ANSWER_LIMITS.keywords)
    throw new BadRequestException(`Ключевые слова: не больше ${ANSWER_LIMITS.keywords}`);
  if (keywords.some((k) => k.length > ANSWER_LIMITS.keyword))
    throw new BadRequestException(
      `Ключевые слова: каждое — не длиннее ${ANSWER_LIMITS.keyword} символов`,
    );
  const when = text(r.when, ANSWER_LIMITS.when, 'Когда подходит');
  // в готовом ответе не должно быть личных данных — как и везде, что видят люди
  const body = safeLinks(
    maskPersonalData(text(r.body, ANSWER_LIMITS.body, 'Текст ответа', true)).text,
  );
  const linksRaw = Array.isArray(r.links) ? r.links : [];
  const links = linksRaw
    .map((l) => {
      const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
      return {
        label: text(o.label, ANSWER_LIMITS.linkLabel, 'Подпись кнопки'),
        url: text(o.url, ANSWER_LIMITS.url, 'Адрес ссылки'),
      };
    })
    .filter((l) => l.label || l.url);
  if (links.length > ANSWER_LIMITS.links)
    throw new BadRequestException(`Кнопки-ссылки: не больше ${ANSWER_LIMITS.links}`);
  for (const l of links) {
    if (!l.label) throw new BadRequestException('Кнопка-ссылка: напишите подпись');
    if (!isUrl(l.url))
      throw new BadRequestException(`Кнопка «${l.label}»: адрес должен начинаться с https://`);
  }
  return { title, keywords, when, body, links, enabled: r.enabled !== false };
}

// ——— Подбор по словам ———

const STOP = new Set([
  'как',
  'что',
  'где',
  'когда',
  'для',
  'при',
  'про',
  'или',
  'это',
  'мне',
  'меня',
  'мой',
  'моя',
  'моё',
  'мое',
  'мои',
  'нужно',
  'надо',
  'можно',
  'хочу',
  'есть',
  'уже',
  'ещё',
  'еще',
  'все',
  'всё',
  'the',
  'and',
  'for',
]);

/** Окончания для грубой основы слова: «записаться» → «записа», «запись» → «запис». */
const ENDINGS = [
  'иями',
  'ями',
  'ами',
  'ого',
  'его',
  'ему',
  'ому',
  'ыми',
  'ими',
  'ешь',
  'ишь',
  'ться',
  'тся',
  'ой',
  'ей',
  'ий',
  'ый',
  'ая',
  'яя',
  'ое',
  'ее',
  'ые',
  'ие',
  'ам',
  'ям',
  'ах',
  'ях',
  'ом',
  'ем',
  'ов',
  'ев',
  'ую',
  'юю',
  'ть',
  'ти',
  'ся',
  'сь',
  'ет',
  'ит',
  'ут',
  'ют',
  'ат',
  'ят',
  'ил',
  'ал',
  'ел',
  'ла',
  'ло',
  'ли',
  'ы',
  'и',
  'а',
  'я',
  'о',
  'е',
  'у',
  'ю',
  'ь',
].sort((a, b) => b.length - a.length);

export function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  const e = ENDINGS.find((x) => w.endsWith(x) && w.length - x.length >= 4);
  return e ? w.slice(0, w.length - e.length) : w;
}

const tokens = (s: string) =>
  (
    s
      .toLowerCase()
      .replace(/ё/g, 'е')
      // «не» — часть смысла: «не работает» склеиваем в одно слово, чтобы не совпало с «работает»
      .replace(/(?<![а-я])не\s+(?=[а-я])/g, 'не')
      .match(/[a-zа-я0-9]+/g) ?? []
  ).filter((w) => w.length >= 3 && !STOP.has(w));

/** Два слова совпадают, если основа одного — начало другого (короче 4 букв — только целиком). */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s);
}

/**
 * Фраза нашлась в тексте целиком: все её значимые слова, в любой форме («не работает касса» найдёт
 * «касса не работает», «кассы не работают»). Общая проверка для готовых ответов и жёстких правил.
 */
export function phraseIn(query: string, phrase: string): boolean {
  const words = tokens(phrase).map(stem);
  if (!words.length) return false;
  const q = tokens(query).map(stem);
  return words.every((w) => q.some((t) => same(w, t)));
}

/**
 * Сколько значимых слов `text` нашлось в `query` (в любой форме) — для «похожих» образцов ответов
 * (ТЗ v4.27). Служебные слова («как», «для», «мне») не считаются.
 */
export function overlap(query: string, text: string): { found: number; total: number } {
  const words = [...new Set(tokens(text).map(stem))];
  const q = tokens(query).map(stem);
  return { found: words.filter((w) => q.some((t) => same(w, t))).length, total: words.length };
}

export interface Candidate {
  answer: CannedAnswer;
  /** Сколько значимых слов лучшей фразы нашлось. */
  score: number;
  /** Фраза найдена целиком (все её значимые слова). */
  full: boolean;
  /** По какой фразе. */
  keyword: string;
}

/** Кандидаты по словам: до `limit` включённых ответов, у которых нашлась хотя бы одна фраза целиком. */
export function candidates(query: string, answers: CannedAnswer[], limit = 3): Candidate[] {
  const q = tokens(query).map(stem);
  if (!q.length) return [];
  const out: Candidate[] = [];
  for (const a of answers) {
    if (!a.enabled) continue;
    let best: Candidate | null = null;
    for (const k of [...a.keywords, a.title]) {
      const words = tokens(k).map(stem);
      if (!words.length) continue;
      const found = words.filter((w) => q.some((t) => same(w, t))).length;
      const full = found === words.length;
      if (!full) continue;
      const cand = { answer: a, score: found, full, keyword: k };
      if (!best || cand.score > best.score) best = cand;
    }
    if (best) out.push(best);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/**
 * Без модели показываем ответ, только если совпадение сильное: фраза из двух и более значимых слов
 * нашлась целиком — и такой ответ один (или он явно впереди).
 */
export function strongMatch(query: string, answers: CannedAnswer[]): CannedAnswer | null {
  const list = candidates(query, answers, 5).filter((c) => c.score >= 2);
  if (!list.length) return null;
  if (list.length > 1 && list[1]!.score === list[0]!.score) return null;
  return list[0]!.answer;
}

export const viewOf = (a: CannedAnswer): CannedView => ({
  id: a.id,
  title: a.title,
  body: a.body,
  links: a.links,
});
