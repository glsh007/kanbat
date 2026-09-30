import { create } from 'zustand';
import { brandWords } from '@/brand/orgBrand';

/**
 * История переходов Канбата (ТЗ v4.9, п. 11) — как «Отменить / Вернуть» в Ворде, только для экранов:
 * каждый открытый экран (обращение, раздел, Бат-Форум, тема, очередь, заявка) — шаг.
 * Живёт во вкладке (sessionStorage): переживает обновление страницы, у новой вкладки — своя.
 * Браузерная история тут ни при чём: Канбат занимает в ней одну запись (см. layout/AppHistory).
 */
export type NavEntry = { path: string; title?: string };

type NavState = {
  /** Чья история (id пользователя): после выхода и входа другим человеком — с чистого листа. */
  owner: string | null;
  entries: NavEntry[];
  index: number;
};

const KEY = 'kc-nav';
/** Сколько шагов помнить. */
export const NAV_LIMIT = 50;

function load(): NavState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as NavState;
      if (Array.isArray(s.entries) && s.entries.length && typeof s.index === 'number')
        return { ...s, index: Math.min(Math.max(0, s.index), s.entries.length - 1) };
    }
  } catch {
    /* нет доступа к хранилищу — начнём заново */
  }
  return { owner: null, entries: [], index: -1 };
}

export const useNavHistory = create<NavState>()(() => load());

useNavHistory.subscribe((s) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* приватный режим — история просто не переживёт обновление */
  }
});

const get = () => useNavHistory.getState();
const set = (s: Partial<NavState>) => useNavHistory.setState(s);

export const currentEntry = (): NavEntry | undefined => get().entries[get().index];

/** Новый шаг: всё «вперёд» отбрасывается, как после нового действия в Ворде. */
export function pushEntry(path: string) {
  const { entries, index } = get();
  if (entries[index]?.path === path) return;
  const next = [...entries.slice(0, index + 1), { path }].slice(-NAV_LIMIT);
  set({ entries: next, index: next.length - 1 });
}

/** Тот же шаг, но другой адрес (перенаправление: «/» → «/s/general»). */
export function replaceEntry(path: string) {
  const { entries, index } = get();
  if (index < 0) return pushEntry(path);
  if (entries[index]?.path === path) return;
  const next = [...entries];
  next[index] = { path };
  set({ entries: next });
}

/** Перейти на шаг истории (стрелки). */
export function moveTo(index: number) {
  const { entries } = get();
  if (index < 0 || index >= entries.length) return;
  set({ index });
}

/** Подпись текущего экрана для подсказки стрелок: «обращение „VPN не подключается“». */
export function setEntryTitle(path: string, title: string) {
  const { entries } = get();
  let changed = false;
  const next = entries.map((e) => {
    if (e.path !== path || e.title === title) return e;
    changed = true;
    return { ...e, title };
  });
  if (changed) set({ entries: next });
}

/** Начать историю заново (другой человек вошёл в кабинет). */
export function resetHistory(owner: string | null, path: string) {
  set({ owner, entries: [{ path }], index: 0 });
}

/** Подпись по адресу — пока экран не назвал себя сам. */
export function describePath(path: string): string {
  const p = path.split(/[?#]/)[0] ?? '/';
  if (/^\/s\/[^/]+\/t\//.test(p)) return 'обращение';
  if (p === '/' || p === '/s/general') return 'мои обращения';
  if (p.startsWith('/s/')) return 'раздел';
  if (p === '/forum/review') return 'на проверке';
  if (p === '/org') return 'организация';
  if (p.startsWith('/messages/archive')) return `архив ${brandWords().dmGen}`;
  if (p.startsWith('/messages/')) return 'переписка';
  if (p === '/messages') return brandWords().dm;
  if (p.startsWith('/forum/t/')) return `тема ${brandWords().forumGen}`;
  if (p.startsWith('/forum/s/')) return `сообщество ${brandWords().forumGen}`;
  if (p.startsWith('/forum')) return brandWords().forum;
  if (/^\/support\/.*t\//.test(p)) return 'заявка';
  if (p.startsWith('/support')) return 'пульт поддержки';
  return 'предыдущий экран';
}

/** Короткое название для подсказки. */
export const clip = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Следующий переход сделан стрелкой Канбата: не новый шаг, а сдвиг по истории. */
let arrowStep: number | null = null;
export function takeArrowStep(): number | null {
  const s = arrowStep;
  arrowStep = null;
  return s;
}

/** Перейти на шаг истории Канбата (стрелки ← →). */
export function goToStep(navigate: (to: string) => void, index: number) {
  const entry = get().entries[index];
  if (!entry) return;
  arrowStep = index;
  navigate(entry.path);
}
