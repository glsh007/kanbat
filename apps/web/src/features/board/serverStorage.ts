import type { StateStorage } from 'zustand/middleware';
import { create } from 'zustand';
import { ApiError, serverApi } from '@/lib/api';
import { mergeBoards, sameBoard, type BoardPart } from './merge';
import { useBoard } from './store';

/**
 * Хранилище доски на сервере (вместо localStorage): задачи, переписка и разделы доступны
 * с любого устройства после входа. Сохраняем с задержкой ~0,8 с одним запросом.
 *
 * До окончания загрузки с сервера запись выключена — иначе пустая доска браузера
 * перезаписала бы данные пользователя.
 */

export type SaveState = 'saved' | 'saving' | 'offline' | 'error';
export const useSaveState = create<{ state: SaveState; message: string | null }>()(() => ({
  state: 'saved',
  message: null,
}));
const setSave = (state: SaveState, message: string | null = null) =>
  useSaveState.setState({ state, message });

const DELAY = 800;
const RETRY = 5000;
/** keepalive-запросы браузер ограничивает ~64 КБ. */
const KEEPALIVE_MAX = 60_000;

let ready = false;
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let loadError: Error | null = null;
/** На сервере ещё не было доски (новый пользователь) — сохраним стартовую сразу. */
let emptyOnServer = false;
/** Версия доски на сервере, поверх которой сохраняем (null — доски ещё нет). */
let serverRev: number | null = null;
/** Применяем слияние, совпадающее с сервером, — сохранять его не нужно. */
let suppress = false;

const part = (s: Partial<BoardPart>): BoardPart => ({
  tasks: s.tasks ?? {},
  order: s.order ?? ({} as BoardPart['order']),
  messages: s.messages ?? {},
  sections: s.sections ?? [],
  tombstones: s.tombstones ?? { tasks: [], sections: [] },
});

/**
 * Доска изменилась в другом окне (телефон, вторая вкладка): сливаем с версией с сервера.
 * Если после слияния отличаемся от сервера — сохраняем (поверх его версии), иначе просто показываем.
 */
function applyRemote(raw: string, rev: number) {
  let remote: Partial<BoardPart>;
  try {
    remote = (JSON.parse(raw) as { state?: Partial<BoardPart> }).state ?? {};
  } catch {
    return;
  }
  serverRev = rev;
  const merged = mergeBoards(part(useBoard.getState()), remote);
  if (sameBoard(merged, remote)) {
    suppress = true;
    try {
      useBoard.setState(merged);
    } finally {
      suppress = false;
    }
  } else useBoard.setState(merged);
}

/** Вернулись в окно — подтянуть изменения из других окон (если своих несохранённых нет). */
async function pull() {
  if (!ready || inflight || pending !== null || serverRev === null) return;
  try {
    const r = await serverApi.getBoard();
    if (r.board && r.board.rev !== serverRev && pending === null)
      applyRemote(r.board.data, r.board.rev);
  } catch {
    /* нет связи — в следующий раз */
  }
}

async function save(keepalive = false): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inflight) await inflight;
  const data = pending;
  if (data === null) return;
  pending = null;
  setSave('saving');
  inflight = serverApi
    .putBoard(data, serverRev, keepalive && data.length < KEEPALIVE_MAX)
    .then((r) => {
      serverRev = r.rev;
      setSave(pending === null ? 'saved' : 'saving');
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        // другое окно успело сохранить — сливаем и сохраняем объединённую доску
        const board = (e.data as { board?: { data: string; rev: number } } | undefined)?.board;
        if (board && ready) applyRemote(board.data, board.rev);
        return;
      }
      if (e instanceof ApiError && e.status && e.status >= 400 && e.status < 500) {
        // сервер отказал по существу (например, доска слишком большая) — повторять бессмысленно
        setSave('error', e.message);
        return;
      }
      // нет связи — вернём в очередь (если за это время не пришло новее) и повторим
      if (pending === null) pending = data;
      setSave('offline');
      if (ready) timer = setTimeout(() => void save(), RETRY);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const serverStorage: StateStorage = {
  getItem: async () => {
    ready = false;
    loadError = null;
    try {
      const r = await serverApi.getBoard();
      emptyOnServer = !r.board;
      serverRev = r.board?.rev ?? null;
      return r.board?.data ?? null;
    } catch (e) {
      loadError = e as Error;
      throw e;
    }
  },
  setItem: (_name, value) => {
    if (!ready || suppress) return;
    pending = value;
    setSave('saving');
    if (!timer) timer = setTimeout(() => void save(), DELAY);
  },
  removeItem: () => undefined,
};

/** Доска загружена — дальше изменения сохраняются на сервер. */
export function startSaving() {
  ready = true;
  // стартовая доска нового пользователя сразу попадает на сервер (рекомендации форума и т. п.)
  if (emptyOnServer) {
    emptyOnServer = false;
    useBoard.setState({});
  }
}

/** Выход: дописать несохранённое и больше не писать. */
export async function stopSaving() {
  await save().catch(() => undefined);
  ready = false;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

export const lastLoadError = () => loadError;

// Уходя со страницы — дописываем несохранённое
if (typeof window !== 'undefined') {
  const flush = () => {
    if (ready && pending !== null) void save(true);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else void pull();
  });
  window.addEventListener('focus', () => void pull());
}
