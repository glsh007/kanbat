/**
 * Персональные данные в чате (ТЗ v4.16): номера СНИЛС, паспорта и банковских карт скрываются
 * ещё до сохранения и до отправки ИИ — человек видит пометку «скрыто». Телефоны, номера заказов
 * и прочие числа не трогаем: паспорт — только рядом со словом «паспорт», СНИЛС — в его формате
 * или рядом со словом «СНИЛС», карта — только если номер проходит проверку Луна.
 * Копия packages/shared/src/privacy.ts (API пакет shared не подключает): сервер скрывает то же
 * ещё раз — перед отправкой ИИ, в заявке специалисту и на БатФоруме.
 */
export type PiiKind = 'snils' | 'passport' | 'card';

export const PII_LABELS: Record<PiiKind, string> = {
  snils: 'номер СНИЛС',
  passport: 'паспортные данные',
  card: 'номер банковской карты',
};

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const SNILS_FORMAT = /(?<!\d)\d{3}-\d{3}-\d{3}[ -]\d{2}(?!\d)/g;
const SNILS_NEAR = /(снилс\D{0,20})(\d{3}[ -]?\d{3}[ -]?\d{3}[ -]?\d{2})(?!\d)/gi;
const PASSPORT_NEAR =
  /(паспорт\S*\D{0,25}?(?:серия\s*)?)(\d{2}\s?\d{2})(\s*(?:№|номер)?\s*)(\d{6})(?!\d)/gi;
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

export function maskPersonalData(text: string): { text: string; found: PiiKind[] } {
  const found = new Set<PiiKind>();
  let out = text.replace(SNILS_NEAR, (_, pre: string) => {
    found.add('snils');
    return `${pre}•••-•••-••• ••`;
  });
  out = out.replace(SNILS_FORMAT, () => {
    found.add('snils');
    return '•••-•••-••• ••';
  });
  out = out.replace(PASSPORT_NEAR, (_, pre: string, _s: string, mid: string) => {
    found.add('passport');
    return `${pre}•• ••${mid}••••••`;
  });
  out = out.replace(CARD, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return m;
    found.add('card');
    return `•••• •••• •••• ${digits.slice(-4)}`;
  });
  return { text: out, found: [...found] };
}
