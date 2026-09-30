import { BadRequestException } from '@nestjs/common';

/**
 * Оформление организации (ТЗ v4.28): свой логотип слева вверху (рядом — «Работает на Канбате»),
 * свой значок вместо летучей мыши и свои названия Бат-Форума и Бат-общения. Не настроено — стандартный Канбат.
 */
export interface BrandImage {
  mime: 'image/png' | 'image/svg+xml';
  /** base64 */
  data: string;
}

export interface OrgBrand {
  logo: BrandImage | null;
  mark: BrandImage | null;
  forumName: string;
  dmName: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Что видят все (и экран входа): картинки — ссылками, чтобы не тянуть их в каждый ответ. */
export interface BrandView {
  logo: string | null;
  mark: string | null;
  forumName: string;
  dmName: string;
}

export const BRAND_LIMITS = { imageBytes: 200 * 1024, name: 30 } as const;

export const EMPTY_BRAND: OrgBrand = { logo: null, mark: null, forumName: '', dmName: '' };

/**
 * SVG — только картинка: без скриптов, обработчиков событий, внешних ссылок и встроенного HTML.
 * Показываем его тегом <img> (скрипты там и так не выполняются) — это второй барьер.
 */
export function unsafeSvg(svg: string): string | null {
  const s = svg.toLowerCase();
  if (!/<svg[\s>]/.test(s)) return 'это не SVG';
  if (/<script[\s>]/.test(s)) return 'в SVG есть скрипт';
  if (/\son[a-z]+\s*=/.test(s)) return 'в SVG есть обработчики событий';
  if (/<foreignobject[\s>]/.test(s)) return 'в SVG есть встроенный HTML';
  if (/javascript:/.test(s)) return 'в SVG есть ссылка javascript:';
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/)/.test(s))
    return 'SVG ссылается на внешние файлы';
  if (/<!entity/.test(s)) return 'в SVG есть объявления сущностей';
  return null;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** data:image/png;base64,… или data:image/svg+xml;base64,… → картинка (или понятная ошибка). */
export function parseImage(v: unknown, field: string): BrandImage {
  const m =
    typeof v === 'string'
      ? /^data:(image\/png|image\/svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(v)
      : null;
  if (!m) throw new BadRequestException(`${field}: нужен файл PNG или SVG`);
  const buf = Buffer.from(m[2]!, 'base64');
  if (!buf.length) throw new BadRequestException(`${field}: файл пустой`);
  if (buf.length > BRAND_LIMITS.imageBytes)
    throw new BadRequestException(`${field}: файл больше 200 КБ`);
  const mime = m[1] as BrandImage['mime'];
  if (mime === 'image/png' && !PNG_SIG.every((b, i) => buf[i] === b))
    throw new BadRequestException(`${field}: файл не похож на PNG`);
  if (mime === 'image/svg+xml') {
    const why = unsafeSvg(buf.toString('utf8'));
    if (why) throw new BadRequestException(`${field}: ${why} — такой файл не принимаем`);
  }
  return { mime, data: buf.toString('base64') };
}

const name = (v: unknown, field: string): string => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (s.length > BRAND_LIMITS.name)
    throw new BadRequestException(`${field}: не длиннее ${BRAND_LIMITS.name} символов`);
  return s;
};

/**
 * Изменения от администратора: logo/mark — data URL (новый файл), null (убрать) или не передано
 * (оставить как есть); названия — пусто = стандартное.
 */
export function mergeBrand(prev: OrgBrand, raw: unknown): OrgBrand {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const img = (key: 'logo' | 'mark', field: string) =>
    !(key in r) ? prev[key] : r[key] === null ? null : parseImage(r[key], field);
  return {
    logo: img('logo', 'Логотип'),
    mark: img('mark', 'Значок'),
    forumName: 'forumName' in r ? name(r.forumName, 'Название форума') : prev.forumName,
    dmName: 'dmName' in r ? name(r.dmName, 'Название личных вопросов') : prev.dmName,
  };
}

export function viewOf(b: OrgBrand): BrandView {
  const v = encodeURIComponent(b.updatedAt ?? '0');
  return {
    logo: b.logo ? `/api/brand/logo?v=${v}` : null,
    mark: b.mark ? `/api/brand/mark?v=${v}` : null,
    forumName: b.forumName,
    dmName: b.dmName,
  };
}
