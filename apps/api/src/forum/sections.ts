/**
 * Стартовые сообщества Бат-Форума (ТЗ v4.3, п. 16). С v4.7 сообщества хранятся в данных:
 * эти шесть создаются при первом запуске, дальше специалисты добавляют свои,
 * а сотрудники предлагают. slug — короткий адрес в стиле Reddit: «б/почта».
 */
export const DEFAULT_SECTIONS = [
  {
    id: 'mail',
    slug: 'почта',
    name: 'Почта и календарь',
    description: 'Outlook, письма, календарь, рассылки',
    icon: 'mail',
  },
  {
    id: 'access',
    slug: 'доступы',
    name: 'Доступы и пароли',
    description: 'Учётные записи, пароли, права на папки и программы',
    icon: 'key',
  },
  {
    id: 'network',
    slug: 'сеть',
    name: 'Сеть и VPN',
    description: 'Интернет, Wi-Fi, VPN, удалённая работа',
    icon: 'wifi',
  },
  {
    id: 'hardware',
    slug: 'железо',
    name: 'Оборудование',
    description: 'Ноутбуки, принтеры, мониторы, гарнитуры',
    icon: 'laptop',
  },
  {
    id: 'software',
    slug: 'программы',
    name: 'Программы',
    description: '1С, CRM, Teams, браузер, установка программ',
    icon: 'app',
  },
  {
    id: 'other',
    slug: 'разное',
    name: 'Другое',
    description: 'Всё, что не подошло в разделы выше',
    icon: 'help',
  },
] as const;

/** Сообщество «по умолчанию»: сюда переезжают темы из архивированных сообществ. */
export const FALLBACK_SECTION = 'other';

/** Значки сообществ (как `COMMUNITY_ICONS` в @app/shared). */
export const COMMUNITY_ICONS = [
  'mail',
  'key',
  'wifi',
  'laptop',
  'app',
  'help',
  'printer',
  'phone',
  'shield',
  'users',
  'database',
  'cloud',
  'book',
  'wrench',
  'calendar',
  'globe',
  'camera',
  'card',
] as const;

export const REPORT_REASONS = ['spam', 'offtopic', 'personal', 'rude', 'other'] as const;
/** Жалоб, после которых тема скрывается из ленты до решения специалиста. */
export const HIDE_AFTER_REPORTS = 3;
/** Сколько активных сообществ может быть всего. */
export const MAX_COMMUNITIES = 24;
/** Сколько предложений может ждать от одного сотрудника. */
export const MAX_PENDING_PER_USER = 3;
