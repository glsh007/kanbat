/**
 * Текстовые помощники БатФорума: основы слов для поиска и фильтр «мусора» (ТЗ v4.7, п. 16).
 */
import type { ForumThread } from '../store/types';

/** Основы слов для поиска: «почта», «почтой», «почты» → «почт». */
export function stems(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[a-zа-я0-9]{3,}/g) ?? []
  )
    .filter((w) => !STOP.has(w))
    .map((w) => w.slice(0, Math.max(4, Math.min(6, w.length - 2))));
}

// служебные слова и слова, которые есть почти в любой жалобе, — по ним «похожесть» ложная
const STOP = new Set([
  'как',
  'что',
  'это',
  'для',
  'при',
  'или',
  'все',
  'всё',
  'уже',
  'меня',
  'мне',
  'нет',
  'не',
  'так',
  'там',
  'тут',
  'его',
  'она',
  'они',
  'был',
  'была',
  'есть',
  'если',
  'когда',
  'почему',
  'очень',
  'можно',
  'нужно',
  'надо',
  'после',
  'перед',
  'the',
  'and',
  'утра',
  'утро',
  'утром',
  'сегодня',
  'вчера',
  'день',
  'новые',
  'новый',
  'новая',
  'работает',
  'работать',
  'работу',
  'проблема',
  'проблемы',
  'помогите',
  'пожалуйста',
  'опять',
  'снова',
]);

/** Насколько тема похожа на запрос: совпадения в названии весят больше. */
export function relevance(t: Pick<ForumThread, 'title' | 'body'>, q: string[]): number {
  if (!q.length) return 0;
  const title = stems(t.title);
  const body = stems(t.body);
  let score = 0;
  for (const w of new Set(q)) {
    if (title.some((x) => x.startsWith(w) || w.startsWith(x))) score += 3;
    else if (body.some((x) => x.startsWith(w) || w.startsWith(x))) score += 1;
  }
  return score;
}

const LETTER = /[a-zа-яё]/i;
const VOWEL = /[аеёиоуыэюяaeiouy]/i;

/** Слова из букв (2+ букв), цифры и знаки не считаются. */
function words(text: string): string[] {
  return text.match(/[a-zа-яё]{2,}/gi) ?? [];
}

/**
 * Почему текст похож на мусор (или null — всё в порядке). Проверки простые и предсказуемые,
 * чтобы не мешать нормальным вопросам: «VPN не подключается», «1С тормозит» проходят.
 */
export function junkReason(text: string, kind: 'title' | 'body' | 'reply' | 'name'): string | null {
  const t = text.trim();
  if (!t) return null;
  // «ааааа», «!!!!!», «.......» — один символ 5+ раз подряд
  if (/(.)\1{4,}/u.test(t.replace(/\s/g, '')))
    return 'Уберите повторы одного символа подряд (например, «ааааа» или «!!!!!»)';
  const chars = t.replace(/\s/g, '');
  const letters = [...chars].filter((c) => LETTER.test(c)).length;
  if (letters < 2) return 'Напишите словами, что случилось';
  if (chars.length >= 6 && letters / chars.length < 0.5)
    return 'Слишком мало букв — напишите словами';
  // «пвапвапвап» — длинные кириллические слова без гласных
  const mash = words(t).find((w) => w.length >= 5 && /^[а-яё]+$/i.test(w) && !VOWEL.test(w));
  if (mash) return `Похоже на случайный набор букв: «${mash}»`;
  if (kind === 'title' && words(t).length < 2)
    return 'Сформулируйте вопрос хотя бы из двух слов — так его найдут поиском';
  return null;
}

/** Адрес сообщества: «б/Сеть и VPN» → «сеть-и-vpn». */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^б\//, '')
    .replace(/ё/g, 'е')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zа-я0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
