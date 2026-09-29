import {
  GENERAL_SECTION_ID,
  type Escalation,
  type Message,
  type Section,
  type Task,
  type Triage,
} from '@app/shared';
import type { BoardData } from './store';

/**
 * Демо-доска под кейс «Поддержка, которая не бесит»: обращения во всех состояниях.
 * Все обращения лежат в «Общем»; разделы «Доступы» и «Оборудование» — подборки из него по смыслу.
 */

/** «Общее» — единственный раздел нового личного кабинета: все обращения человека. */
export function baseSections(): Section[] {
  return [
    {
      id: GENERAL_SECTION_ID,
      name: 'Общее',
      description: 'Все обращения',
      color: 'clay',
      sharedContext: false,
    },
  ];
}

/** Демо-разделы. По описанию ИИ раскладывает задачи; пользователь может менять и удалять разделы. */
export function demoSections(): Section[] {
  return [
    ...baseSections(),
    {
      id: 'access',
      name: 'Доступы',
      description:
        'Учётные записи, пароли, вход в системы, VPN, права доступа к папкам и программам',
      color: 'kraft',
      sharedContext: true,
    },
    {
      id: 'hardware',
      name: 'Оборудование',
      description: 'Ноутбуки, принтеры, камеры, мониторы и другая техника',
      color: 'stone',
      sharedContext: false,
    },
  ];
}

type Seed = Pick<Task, 'title' | 'structure' | 'difficulty' | 'column' | 'status'> &
  Partial<Omit<Task, 'id' | 'hiddenFrom'>> & {
    /** Первое сообщение — исходное обращение (по умолчанию = title). */
    text?: string;
    chat?: Omit<Message, 'id' | 'taskId' | 'createdAt'>[];
  };

const ts = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function tomorrowAt9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

const triage = (
  t: Partial<Triage> & Pick<Triage, 'summary' | 'service' | 'urgency' | 'mode'>,
): Triage => ({
  meaningful: true,
  reply: '',
  facts: [],
  missing: [],
  urgency_reason: '',
  structure: 'clear',
  difficulty: 'easy',
  title: '',
  estimated_seconds: 20,
  ...t,
});

// ——— Срочное обращение из кейса: шаги в процессе ———
const urgentTriage = triage({
  summary: 'Не удаётся войти в рабочую систему с ноутбука, с телефона вход работает.',
  service: 'Рабочая система (вход с ноутбука)',
  facts: [
    'Вчера всё работало',
    'С телефона открывается',
    'С ноутбука — нет',
    'Через 20 минут встреча',
  ],
  urgency: 'critical',
  urgency_reason: 'Встреча через 20 минут — работа заблокирована.',
  mode: 'steps',
});
const urgentSteps: {
  title: string;
  instruction: string;
  check: string;
  yes: string;
  no: string;
}[] = (
  [
    {
      title: 'Подключиться к встрече с телефона',
      instruction:
        'Раз с телефона система открывается — используйте его, чтобы успеть на встречу. Причину разберём после.',
      check: 'Подключились к встрече?',
    },
    {
      title: 'Проверить VPN на ноутбуке',
      instruction:
        'Значок VPN в правом нижнем углу должен быть зелёным. Если серый — нажмите на него и выберите «Подключить».',
      check: 'Значок VPN стал зелёным?',
    },
    {
      title: 'Открыть систему в режиме инкогнито',
      instruction:
        'Нажмите Ctrl+Shift+N в браузере и войдите ещё раз — так исключим проблему с сохранёнными данными.',
      check: 'Получилось войти?',
    },
  ] as { title: string; instruction: string; check: string }[]
).map((s) => ({ ...s, yes: '', no: '' }));

// ——— Передано специалисту ———
const accessEscalation: Escalation = {
  status: 'new',
  reason: 'Самостоятельно эту проблему не решить',
  createdAt: minutesAgo(12),
  updatedAt: minutesAgo(12),
  handoff: {
    original: 'Нужен доступ к общей папке бухгалтерии на сервере, без него не могу закрыть отчёт',
    qa: [{ q: 'Какой доступ нужен?', a: 'Только чтение' }],
    hypothesis:
      'У пользователя нет прав на папку «Бухгалтерия» — нужна выдача доступа администратором.',
    actions: [],
    result: 'Папка не открывается: «Отказано в доступе».',
    notes: 'Нужно для квартального отчёта до конца дня.',
    service: 'Файловый сервер',
    urgency: 'high',
  },
};

const general: Seed[] = [
  {
    title: 'Принтер на 3 этаже печатает пустые листы',
    sections: ['hardware'],
    structure: 'clear',
    difficulty: 'easy',
    column: 'draft',
    status: 'idle',
  },
  {
    title: 'Продлить доступ к VPN на время командировки',
    sections: ['access'],
    structure: 'clear',
    difficulty: 'easy',
    column: 'draft',
    status: 'scheduled',
    scheduledAt: tomorrowAt9(),
    recipient: 'support',
    preview: 'Уйдёт специалисту к началу рабочего дня поддержки',
  },
  {
    title: 'Что-то не так с почтой',
    text: 'У меня что-то с почтой, с утра какая-то ерунда',
    structure: 'loose',
    difficulty: 'easy',
    column: 'clarify',
    status: 'awaiting_user',
    urgency: 'normal',
    checkpoint: 'questions',
    questions: [
      {
        text: 'Что именно не так?',
        options: ['Не приходят письма', 'Не отправляются', 'Outlook не открывается', 'Не знаю'],
      },
      {
        text: 'Где вы смотрите почту?',
        options: ['Outlook на ноутбуке', 'В браузере', 'На телефоне', 'Не знаю'],
      },
    ],
    pendingQuestions: 2,
    preview: 'Что именно не так?',
    triage: triage({
      summary: 'Проблема с почтой, характер неясен.',
      service: 'Почта',
      urgency: 'normal',
      mode: 'steps',
      structure: 'loose',
      missing: ['Что именно не работает', 'На каком устройстве'],
    }),
    chat: [
      {
        role: 'assistant',
        kind: 'triage',
        content: 'Проблема с почтой, характер неясен.',
        triage: triage({
          summary: 'Проблема с почтой, характер неясен.',
          service: 'Почта',
          urgency: 'normal',
          mode: 'steps',
          structure: 'loose',
          missing: ['Что именно не работает', 'На каком устройстве'],
        }),
      },
      {
        role: 'assistant',
        kind: 'questions',
        content: 'Чтобы не гадать, уточню две вещи.',
        questions: [
          {
            text: 'Что именно не так?',
            options: ['Не приходят письма', 'Не отправляются', 'Outlook не открывается', 'Не знаю'],
          },
          {
            text: 'Где вы смотрите почту?',
            options: ['Outlook на ноутбуке', 'В браузере', 'На телефоне', 'Не знаю'],
          },
        ],
      },
    ],
  },
  {
    title: 'Не могу войти в рабочую систему с ноутбука',
    sections: ['access'],
    text: 'У меня опять всё сломалось. Вчера всё работало, сегодня не могу зайти в рабочую систему. Через телефон открывается, с ноутбука нет. Мне через 20 минут на встречу',
    structure: 'clear',
    difficulty: 'easy',
    column: 'working',
    status: 'awaiting_user',
    urgency: 'critical',
    triage: urgentTriage,
    checkpoint: 'step',
    attempts: 1,
    stepIndex: 1,
    pendingQuestions: 1,
    plan: urgentSteps.map((s, i) => ({
      ...s,
      done: i === 0,
      result: i === 0 ? ('ok' as const) : undefined,
      answer: i === 0 ? 'Да, с телефона подключился, я на встрече' : undefined,
    })),
    preview: `Шаг 2 из 3: ${urgentSteps[1]!.title}`,
    chat: [
      { role: 'assistant', kind: 'triage', content: urgentTriage.summary, triage: urgentTriage },
      {
        role: 'assistant',
        kind: 'steps',
        content:
          'Сначала — быстрый обходной путь, чтобы вы успели на встречу, потом разберёмся с причиной.',
        steps: urgentSteps,
      },
      { role: 'user', content: 'Да, с телефона подключился, я на встрече' },
      {
        role: 'assistant',
        content: `Отлично, встреча не сорвётся. Теперь разберёмся с ноутбуком.\n\n**Шаг 2 из 3. ${urgentSteps[1]!.title}.** ${urgentSteps[1]!.instruction}`,
      },
    ],
  },
  {
    title: 'Доступ к папке бухгалтерии на сервере',
    sections: ['access'],
    text: accessEscalation.handoff.original,
    structure: 'clear',
    difficulty: 'easy',
    column: 'working',
    status: 'with_support',
    urgency: 'high',
    recipient: 'support',
    escalation: accessEscalation,
    preview: 'Передано специалисту — ждёт ответа',
    triage: triage({
      summary: 'Нет доступа к папке «Бухгалтерия» на файловом сервере.',
      service: 'Файловый сервер',
      urgency: 'high',
      urgency_reason: 'Отчёт нужно закрыть сегодня.',
      mode: 'escalate',
    }),
    chat: [
      {
        role: 'assistant',
        content:
          'Выдать доступ к папке может только администратор — самому это не сделать. Передать обращение специалисту? Он получит короткую сводку — пересказывать ничего не придётся.',
      },
      { role: 'user', content: 'Передать специалисту' },
      {
        role: 'assistant',
        kind: 'handoff',
        content:
          'Передаю обращение специалисту: выдать доступ может только администратор. Он получит короткую сводку — пересказывать ничего не нужно.',
        handoff: accessEscalation.handoff,
      },
    ],
  },
  {
    title: 'Долго открывается 1С',
    structure: 'clear',
    difficulty: 'easy',
    column: 'review',
    status: 'awaiting_user',
    urgency: 'normal',
    checkpoint: 'review',
    pendingQuestions: 1,
    attempts: 1,
    triage: triage({
      summary: '1С запускается несколько минут.',
      service: '1С',
      urgency: 'normal',
      mode: 'steps',
    }),
    plan: [
      { title: 'Очистить кэш 1С', done: true, result: 'ok' },
      { title: 'Перезапустить компьютер', done: true, result: 'ok' },
    ],
    preview: 'Все шаги выполнены. Всё в порядке?',
  },
  {
    title: 'Как сменить пароль от почты',
    sections: ['access'],
    structure: 'clear',
    difficulty: 'easy',
    column: 'done',
    status: 'idle',
    urgency: 'low',
    preview: 'Настройки → Безопасность → Сменить пароль',
    chat: [
      {
        role: 'assistant',
        content:
          '1. Откройте **Outlook в браузере**.\n2. Нажмите на свой аватар → **Настройки** → **Безопасность**.\n3. Выберите **Сменить пароль** и следуйте подсказкам.\n\nНовый пароль: не короче 12 символов, с цифрой и заглавной буквой.',
      },
    ],
  },
  {
    title: 'Не работает камера в Teams',
    sections: ['hardware'],
    structure: 'clear',
    difficulty: 'easy',
    column: 'working',
    status: 'error',
    lastStep: 'classify',
    errorMessage: 'Модель не ответила вовремя',
  },
];

const access: Seed[] = [
  {
    title: 'Не приходит код для входа в CRM',
    sections: ['access'],
    structure: 'clear',
    difficulty: 'easy',
    column: 'draft',
    status: 'idle',
  },
];

export function createDemoBoard(): BoardData {
  const tasks: BoardData['tasks'] = {};
  const order: BoardData['order'] = { draft: [], clarify: [], working: [], review: [], done: [] };
  const messages: BoardData['messages'] = {};
  const created = ts();
  // Переданные специалисту примеры не кладём: обращения к специалисту теперь настоящие,
  // общие на сервере, и у каждого нового пользователя появлялись бы копии.
  const seeds = [...general, ...access].filter((s) => !s.escalation && s.status !== 'with_support');

  // у каждой порции примеров свои id: «Добавить примеры» можно нажать не раз, а метки удаления
  // (слияние окон) не должны задевать новые примеры
  const batch = Math.random().toString(36).slice(2, 7);
  seeds.forEach(({ chat = [], text, ...s }, i) => {
    const id = `demo-${batch}-${i + 1}`;
    tasks[id] = {
      id,
      sections: [],
      hiddenFrom: [],
      scheduledAt: null,
      recipient: 'ai',
      pendingQuestions: 0,
      plan: null,
      preview: null,
      errorMessage: null,
      checkpoint: null,
      questions: null,
      lastStep: null,
      estimatedSeconds: null,
      titleEdited: false,
      triage: null,
      urgency: 'normal',
      stepIndex: 0,
      attempts: 0,
      escalation: null,
      // разное время создания — чтобы работала сортировка «сначала новые»
      createdAt: minutesAgo((seeds.length - i) * 37),
      updatedAt: created,
      ...s,
    };
    messages[id] = [
      { id: `${id}-m0`, taskId: id, role: 'user', content: text ?? s.title, createdAt: created },
      ...chat.map((m, j) => ({ ...m, id: `${id}-m${j + 1}`, taskId: id, createdAt: created })),
    ];
    if (s.status !== 'scheduled') order[s.column].push(id);
  });
  return { tasks, order, messages };
}
