import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  UNSAFE_NavigationContext as NavigationContext,
  useLocation,
  type Navigator,
  type To,
} from 'react-router';
import {
  currentEntry,
  moveTo,
  pushEntry,
  replaceEntry,
  resetHistory,
  takeArrowStep,
  useNavHistory,
} from '@/features/nav/history';
import { useUser } from '@/lib/session';

/**
 * Две истории (ТЗ v4.9, п. 11).
 *
 * 1. **Браузер** — между сайтами. Все переходы внутри Канбата заменяют одну и ту же запись,
 *    поэтому «Назад» в браузере уводит туда, откуда Канбат открыли, а если Канбат открыт первым —
 *    стрелка браузера неактивна.
 *    Исключение — узкий экран (телефон): открытое обращение, тема или заявка добавляют одну запись,
 *    чтобы жест «Назад» сначала закрывал экран, а уже со списка уводил с сайта.
 * 2. **Канбат** — между экранами: стрелки ← → в шапке (`NavArrows`), каждый экран — шаг.
 *
 * Подменяет navigator роутера — работает для всех ссылок и переходов сразу.
 */

const FLAG = '__kbDetail';
const NARROW = '(max-width: 1023px)';

const pathOf = (to: To): string => {
  if (typeof to === 'string') return to.split('#')[0] || '/';
  return `${to.pathname ?? window.location.pathname}${to.search ?? ''}`;
};
const here = () => `${window.location.pathname}${window.location.search}`;
const isDetail = (p: string) => /\/t\/[^/?#]+\/?(\?|$)/.test(p);
const narrow = () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches;

/** Эта запись браузера — наша «подробности на телефоне»? */
function inDetailEntry(): boolean {
  const usr = (window.history.state as { usr?: unknown } | null)?.usr;
  return !!usr && typeof usr === 'object' && FLAG in usr;
}
const withFlag = (state: unknown) => ({
  ...(state && typeof state === 'object' ? state : {}),
  [FLAG]: true,
});

type Pending = { to: To; state: unknown; opts: Parameters<Navigator['replace']>[2] };
/** После «go(-1)» (убрали запись подробностей) — куда перейти на самом деле. */
let afterPop: Pending | null = null;
export function AppHistory({ children }: { children: ReactNode }) {
  const ctx = useContext(NavigationContext);

  const value = useMemo(() => {
    const base = ctx.navigator;

    /** Как изменить историю браузера, чтобы Канбат занимал в ней одну запись. */
    const browser: Navigator['push'] = (to, state, opts) => {
      const target = pathOf(to);
      if (narrow() && isDetail(target))
        return inDetailEntry()
          ? base.replace(to, withFlag(state), opts)
          : base.push(to, withFlag(state), opts);
      if (inDetailEntry()) {
        // закрываем подробности: сначала убираем их запись, потом — куда нужно
        afterPop = { to, state, opts };
        return base.go(-1);
      }
      return base.replace(to, state, opts);
    };

    const record = (to: To, kind: 'push' | 'replace') => {
      const target = pathOf(to);
      const arrow = takeArrowStep();
      if (arrow !== null) moveTo(arrow);
      else if (kind === 'push' && target !== here()) pushEntry(target);
      else replaceEntry(target);
    };

    const navigator: Navigator = {
      ...base,
      push(to, state, opts) {
        record(to, 'push');
        return browser(to, state, opts);
      },
      replace(to, state, opts) {
        record(to, 'replace');
        // перенаправление внутри подробностей на телефоне сохраняет их запись
        return inDetailEntry() && isDetail(pathOf(to))
          ? base.replace(to, withFlag(state), opts)
          : browser(to, state, opts);
      },
    };
    return { ...ctx, navigator };
  }, [ctx]);

  return (
    <NavigationContext.Provider value={value}>
      <Tracker onAfterPop={(p) => value.navigator.replace(p.to, p.state, p.opts)} />
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Следит за адресом: первый экран после входа, обновление страницы, жест «Назад» на телефоне.
 * Переходы через ссылки уже записаны в navigator — здесь только то, что пришло извне.
 */
function Tracker({ onAfterPop }: { onAfterPop: (p: Pending) => void }) {
  const location = useLocation();
  const me = useUser();
  const first = useRef(true);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const { owner, entries, index } = useNavHistory.getState();
    if (first.current) {
      first.current = false;
      // другой человек или пустая история — с чистого листа; своя — продолжаем (обновили страницу)
      if (owner !== (me?.id ?? null) || !entries.length) return resetHistory(me?.id ?? null, path);
      if (entries[index]?.path !== path) pushEntry(path);
      return;
    }
    if (afterPop) {
      const p = afterPop;
      afterPop = null;
      if (pathOf(p.to) !== path) onAfterPop(p);
      return;
    }
    if (currentEntry()?.path === path) return;
    // пришло из браузера (жест «Назад» закрыл подробности на телефоне)
    if (entries[index - 1]?.path === path) moveTo(index - 1);
    else if (entries[index + 1]?.path === path) moveTo(index + 1);
    else pushEntry(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только смена адреса
  }, [location.key]);

  return null;
}
