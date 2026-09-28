import type { ForumReply, ForumThread } from '../store/types';

/**
 * Стартовые обсуждения — чтобы форум не был пустым на показе.
 * Авторы вымышленные; «Служба поддержки» — от имени специалистов.
 */
type SeedReply = {
  author: string;
  role?: 'specialist';
  body: string;
  votes: number;
  solution?: boolean;
};
type SeedThread = {
  section: string;
  author: string;
  role?: 'specialist';
  title: string;
  body: string;
  votes: number;
  pinned?: boolean;
  hoursAgo: number;
  replies: SeedReply[];
};

const SEED: SeedThread[] = [
  {
    section: 'other',
    author: 'Служба поддержки',
    role: 'specialist',
    title: 'Как описать проблему, чтобы помогли быстрее',
    body: 'Пишите своими словами, но добавьте три вещи: **что делали** перед проблемой, **что видите** на экране (текст ошибки или скриншот) и **насколько срочно** — например, «через час созвон с клиентом». Этого почти всегда достаточно, чтобы помощник или специалист сразу перешли к решению.',
    votes: 24,
    pinned: true,
    hoursAgo: 240,
    replies: [],
  },
  {
    section: 'mail',
    author: 'Марина',
    title: 'Outlook перестал получать письма, в браузере всё приходит',
    body: 'С утра в Outlook на ноутбуке нет новых писем, внизу написано «Отключено». В веб-версии письма есть. Перезапуск не помог.',
    votes: 12,
    hoursAgo: 30,
    replies: [
      {
        author: 'Служба поддержки',
        role: 'specialist',
        body: 'Скорее всего, включена «Автономная работа». Вкладка **Отправка и получение** → снимите «Автономная работа». Если кнопки нет — **Файл → Настройка учётных записей → Восстановить**.',
        votes: 15,
        solution: true,
      },
      {
        author: 'Игорь',
        body: 'Было то же самое после обновления Windows, помогло восстановление профиля.',
        votes: 4,
      },
    ],
  },
  {
    section: 'network',
    author: 'Олег',
    title: 'VPN подключается, но рабочие сайты не открываются',
    body: 'Из дома VPN показывает «Подключено», а внутренний портал и 1С не открываются. Обычные сайты работают.',
    votes: 9,
    hoursAgo: 52,
    replies: [
      {
        author: 'Служба поддержки',
        role: 'specialist',
        body: 'Отключите VPN, перезагрузите домашний роутер и подключитесь снова. Если домашняя сеть 192.168.1.x совпадает с офисной — напишите нам, пропишем отдельный маршрут.',
        votes: 8,
        solution: true,
      },
    ],
  },
  {
    section: 'access',
    author: 'Екатерина',
    title: 'Пароль истёк в отпуске — как войти?',
    body: 'Вернулась из отпуска, система пишет, что срок действия пароля истёк, а сменить его не даёт.',
    votes: 7,
    hoursAgo: 75,
    replies: [
      {
        author: 'Служба поддержки',
        role: 'specialist',
        body: 'Если вход в Windows ещё работает — **Ctrl + Alt + Delete → Изменить пароль**. Если нет, создайте обращение «сбросить пароль»: сбросим в течение 15 минут, временный пароль придёт руководителю.',
        votes: 6,
        solution: true,
      },
    ],
  },
  {
    section: 'hardware',
    author: 'Дмитрий',
    title: 'Принтер на 3 этаже печатает пустые листы',
    body: 'Документ уходит, принтер протягивает бумагу, но листы пустые. У коллег то же самое.',
    votes: 5,
    hoursAgo: 8,
    replies: [
      {
        author: 'Анна',
        body: 'Похоже на закончившийся тонер. У нас так было — на экране принтера была ошибка про картридж.',
        votes: 3,
      },
    ],
  },
  {
    section: 'software',
    author: 'Светлана',
    title: '1С очень долго открывается по утрам',
    body: 'Первые 10–15 минут после входа 1С открывается по несколько минут, потом нормально.',
    votes: 4,
    hoursAgo: 20,
    replies: [
      {
        author: 'Служба поддержки',
        role: 'specialist',
        body: 'Утром 1С обновляет кэш. Помогает очистка кэша: в окне запуска выберите базу → **Настройка** → «Очистить кэш». Если не поможет — пишите, проверим сервер.',
        votes: 5,
      },
    ],
  },
  {
    section: 'hardware',
    author: 'Павел',
    title: 'Коллеги не слышат меня в Teams через гарнитуру',
    body: 'Гарнитура USB, в других программах микрофон работает, в Teams — тишина.',
    votes: 6,
    hoursAgo: 4,
    replies: [],
  },
];

const hours = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
/** Голоса стартовых тем — «анонимные» id, чтобы счётчики были правдоподобными. */
const fakeVoters = (n: number, key: string) =>
  Array.from({ length: n }, (_, i) => `seed-${key}-${i}`);

export function seedForum(): { threads: ForumThread[]; replies: ForumReply[] } {
  const threads: ForumThread[] = [];
  const replies: ForumReply[] = [];
  SEED.forEach((t, i) => {
    const id = `seed-thread-${i + 1}`;
    const rs = t.replies.map((r, j) => ({
      id: `${id}-r${j + 1}`,
      threadId: id,
      body: r.body,
      authorId: `seed-${r.author}`,
      authorName: r.author,
      authorRole: r.role ?? ('employee' as const),
      voters: fakeVoters(r.votes, `${id}-r${j}`),
      createdAt: hours(t.hoursAgo - (j + 1) * 0.7),
    }));
    replies.push(...rs);
    threads.push({
      id,
      sectionId: t.section,
      title: t.title,
      body: t.body,
      authorId: `seed-${t.author}`,
      authorName: t.author,
      authorRole: t.role ?? 'employee',
      voters: fakeVoters(t.votes, id),
      pinned: !!t.pinned,
      solutionId: rs[t.replies.findIndex((r) => r.solution)]?.id ?? null,
      replyCount: rs.length,
      createdAt: hours(t.hoursAgo),
      activityAt: rs.at(-1)?.createdAt ?? hours(t.hoursAgo),
    });
  });
  return { threads, replies };
}
