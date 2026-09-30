import { create } from 'zustand';
import { BRAND } from './brand';

/**
 * Оформление организации (ТЗ v4.28): свой логотип и значок, свои названия форума и личных вопросов.
 * Не настроено — стандартный Канбат. Загружается без входа (нужно и экрану входа); последнее
 * известное оформление хранится в браузере, чтобы при открытии не мелькал стандартный логотип.
 */
export interface OrgBrandView {
  logo: string | null;
  mark: string | null;
  forumName: string;
  dmName: string;
  orgName: string;
}

const EMPTY: OrgBrandView = { logo: null, mark: null, forumName: '', dmName: '', orgName: '' };
const CACHE = 'kc-brand';

/** Только строки: неожиданный ответ сервера или старый кэш не должны ломать отрисовку. */
export function cleanBrand(
  v: Partial<Record<keyof OrgBrandView, unknown>> | null | undefined,
): OrgBrandView {
  if (!v || typeof v !== 'object') return EMPTY;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const url = (x: unknown) => (typeof x === 'string' && x.startsWith('/api/brand/') ? x : null);
  return {
    logo: url(v.logo),
    mark: url(v.mark),
    forumName: str(v.forumName).slice(0, 30),
    dmName: str(v.dmName).slice(0, 30),
    orgName: str(v.orgName),
  };
}

function cached(): OrgBrandView {
  try {
    return cleanBrand(JSON.parse(localStorage.getItem(CACHE) ?? 'null'));
  } catch {
    return EMPTY;
  }
}

export const useOrgBrand = create<OrgBrandView>(() => cached());

export function setOrgBrand(v: Partial<Record<keyof OrgBrandView, unknown>>) {
  const next = cleanBrand(v);
  useOrgBrand.setState(next);
  // вкладка браузера: своё оформление и название организации в профиле — её имя, иначе «Канбат»
  if (typeof document !== 'undefined')
    document.title = (next.logo || next.mark) && next.orgName ? next.orgName : BRAND.name;
  try {
    localStorage.setItem(CACHE, JSON.stringify(next));
  } catch {
    /* браузер не даёт хранить — просто без кэша */
  }
}

let loading: Promise<void> | null = null;

/** Загрузить оформление с сервера (один раз за открытие; reload — принудительно). */
export function loadOrgBrand(reload = false): Promise<void> {
  if (loading && !reload) return loading;
  loading = fetch('/api/brand')
    .then((r) => (r.ok ? (r.json() as Promise<OrgBrandView>) : null))
    .then((v) => {
      if (v) setOrgBrand(v);
    })
    .catch(() => {});
  return loading;
}

export const DEFAULT_FORUM = 'Бат-Форум';
export const DEFAULT_DM = 'Бат-общение';

/** Название форума: своё у организации или «Бат-Форум». */
export const useForumName = () => useOrgBrand((s) => s.forumName) || DEFAULT_FORUM;
/** Название личных вопросов: своё у организации или «Бат-общение». */
export const useDmName = () => useOrgBrand((s) => s.dmName) || DEFAULT_DM;
/** Для кода вне React. */
export const forumName = () => useOrgBrand.getState().forumName || DEFAULT_FORUM;
export const dmName = () => useOrgBrand.getState().dmName || DEFAULT_DM;

/** Название форума и личных вопросов в нужном падеже: свои названия не склоняем — «форум «Помощь»». */
export interface BrandWords {
  forum: string;
  forumGen: string;
  forumDat: string;
  forumPrep: string;
  dm: string;
  dmGen: string;
  dmAcc: string;
  dmPrep: string;
}

export function wordsOf(b: Pick<OrgBrandView, 'forumName' | 'dmName'>): BrandWords {
  const f = b.forumName;
  const d = b.dmName;
  return {
    forum: f || DEFAULT_FORUM,
    forumGen: f ? `форума «${f}»` : 'Бат-Форума',
    forumDat: f ? `форуму «${f}»` : 'Бат-Форуму',
    forumPrep: f ? `форуме «${f}»` : 'Бат-Форуме',
    dm: d || DEFAULT_DM,
    dmGen: d ? `раздела «${d}»` : 'Бат-общения',
    dmAcc: d ? `раздел «${d}»` : 'Бат-общение',
    dmPrep: d ? `разделе «${d}»` : 'Бат-общении',
  };
}

/** Для компонентов: обновляется, когда администратор меняет названия. */
export function useBrandWords(): BrandWords {
  const forumName = useOrgBrand((s) => s.forumName);
  const dmName = useOrgBrand((s) => s.dmName);
  return wordsOf({ forumName, dmName });
}

/** Для кода вне React (заголовки истории переходов и т. п.). */
export const brandWords = (): BrandWords => wordsOf(useOrgBrand.getState());
