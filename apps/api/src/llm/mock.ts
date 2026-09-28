import type {
  AnswerOutcome,
  ChatMessage,
  ClassifyResult,
  HandoffResult,
  PlanResult,
  QuestionsResult,
  SectionRef,
  SortItem,
  SortResult,
  StepsResult,
  StreamMode,
  Triage,
} from './types';

/**
 * Демо-режим: когда Ollama не запущена или в ней нет моделей.
 * Приложение полностью работает (карточки двигаются), но ответы — заготовки.
 */

const HARD =
  /план|стратег|проект|исследов|тз\b|техническое задание|отч[её]т|курс|бизнес|сайт|приложени|маркетинг|анализ/i;
const LOOSE = /хочу|помоги|придумай|посоветуй|как лучше|что-нибудь|идеи|не знаю|подскажи/i;

export function mockClassify(text: string): ClassifyResult {
  const hard = HARD.test(text) || text.length > 180;
  const loose = LOOSE.test(text);
  const words = text
    .replace(/[«»"'.!?]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  return {
    structure: loose ? 'loose' : 'clear',
    difficulty: hard ? 'hard' : 'easy',
    reason: 'Демо-режим: тип определён по ключевым словам (Ollama не подключена).',
    estimated_seconds: hard ? 60 : 10,
    title: words.slice(0, 6).join(' ') || 'Новая задача',
  };
}

export function mockQuestions(hard: boolean): QuestionsResult {
  return {
    intro: 'Чтобы ответ попал в цель, уточню пару моментов.',
    questions: hard
      ? [
          {
            text: 'Какой результат вы хотите получить в итоге?',
            options: ['Пошаговый план', 'Готовый текст', 'На твоё усмотрение'],
          },
          { text: 'Какой срок или объём?', options: ['Кратко', 'Подробно', 'На твоё усмотрение'] },
        ]
      : [
          {
            text: 'Что для вас важнее всего?',
            options: ['Скорость', 'Качество', 'Цена', 'На твоё усмотрение'],
          },
        ],
  };
}

export function mockPlan(): PlanResult {
  return {
    intro: 'Сделаю в четыре шага и покажу результат.',
    steps: ['Уточнить исходные данные', 'Собрать варианты', 'Сравнить и выбрать', 'Оформить итог'],
  };
}

export function mockAnswer(history: ChatMessage[], mode: StreamMode, plan: string[]): string {
  const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const head = `> **Демо-режим.** Ollama не найдена, поэтому это заготовка, а не ответ модели. Запустите Ollama и скачайте модель — ответы станут настоящими.\n\n`;
  if (mode === 'execute' && plan.length) {
    return (
      head +
      plan
        .map(
          (s, i) =>
            `<step>${i + 1}</step>\n### ${i + 1}. ${s}\n\nЗдесь будет содержание шага «${s}».\n`,
        )
        .join('\n') +
      '\n**Итог:** план выполнен.'
    );
  }
  return `${head}Вы спросили: «${last.slice(0, 200)}».\n\nЗдесь будет полный ответ модели в Markdown:\n\n- пункт первый;\n- пункт второй.\n\n\`\`\`ts\nconst answer = 42;\n\`\`\``;
}

/** Имитация стриминга: выдаёт текст кусочками с небольшой задержкой. */
export async function* mockStream(text: string, signal?: AbortSignal): AsyncGenerator<string> {
  const parts = text.match(/\S+\s*|\s+/g) ?? [];
  for (const p of parts) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 18));
    yield p;
  }
}

// ——— Режим поддержки: заготовки для демо-режима ———

const URGENT =
  /срочн|через \d+ ?мин|встреч|горит|немедленно|прямо сейчас|у всего отдела|у всех|дедлайн/i;
const ESCALATE =
  /доступ к|дайте доступ|нужны права|права администратора|разбил|сломал[аоси]*сь? физически|не включается|замен|у всех|у всего отдела/i;
/** Строка — пример вычисления: «2 + 3», «15*4», «(100 - 7) / 3 =?». Не «10:30» и не «8-800-…» в тексте. */
export const ARITHMETIC = /^[\s\d.,()]*\d\s*[-+*/×÷^]\s*[\d(][\s\d.,()+\-*/×÷^]*=?\s*\??\s*$/;
const QUESTION = /^(как|где|что такое|можно ли|подскажите,? как|сколько|чему равн|посчитай)/i;

/**
 * Похоже на вопрос или просьбу о помощи — даже без «?» («Сколько будет 2 + 3», «помогите с почтой»).
 * В JS `\b` не работает с кириллицей, поэтому граница слова — `(?=[\s,.!?]|$)`.
 */
const REQUEST_START = new RegExp(
  '^(как|где|когда|куда|откуда|почему|зачем|сколько|какой|какая|какое|какие|каким|какую|кто|кого|кому|чем|что|чего|чему|' +
    'можно ли|нужно ли|помоги\\S*|помогите|подскаж\\S*|объясни\\S*|расскажи\\S*|посчитай\\S*|переведи\\S*|найди\\S*|' +
    'не (работает|открывается|включается|печатает|могу|получается|грузится|приходит))(?=[\\s,.!?]|$)',
  'i',
);
export function looksLikeRequest(line: string): boolean {
  const t = line.trim();
  return /\?\s*$/.test(t) || ARITHMETIC.test(t) || REQUEST_START.test(t);
}

/** Модель поздоровалась, хотя пользователь не здоровался: «Привет! Чем могу помочь?» на «2 + 3». */
const LEADING_HELLO = /^(привет\S*|здравствуй\S*|добр\S+ (утро|день|вечер))[\s!.,)]*/i;
export function dropUnaskedGreeting(reply: string, userText: string): string {
  const last = userText.trim().split('\n').filter(Boolean).at(-1)?.trim() ?? '';
  if (GREETING.test(last) || /^(привет|здравствуй|добр\S+ (утро|день|вечер))/i.test(last))
    return reply;
  const rest = reply.replace(LEADING_HELLO, '').trim();
  return rest ? rest[0]!.toUpperCase() + rest.slice(1) : '';
}

const SERVICES: [RegExp, string][] = [
  [/outlook|почт|письм/i, 'Почта'],
  [/vpn|впн/i, 'VPN'],
  [/принтер|печат/i, 'Принтер'],
  [/1с|1c/i, '1С'],
  [/teams|zoom|камер|микрофон/i, 'Видеосвязь'],
  [/wi-?fi|интернет|сеть/i, 'Сеть'],
  [/пароль|войти|зайти|логин|учётн|учетн/i, 'Вход в рабочую систему'],
];

/**
 * Явно бессмысленный текст («F», «???», «ыы») — даже не спрашиваем модель:
 * иначе она охотно «додумывает» проблему, которой не было.
 */
export function looksMeaningless(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const clean = text.trim().toLowerCase();
  if (ARITHMETIC.test(clean)) return false; // «2+3» — вопрос, хоть и без букв
  return letters < 3 || /^(тест|test|hi|hello|ok|ок|ау|\.+|\?+)$/i.test(clean);
}

// Реплики без обращения: приветствие, благодарность, «ничего не случилось»
const GREETING =
  /^(привет\w*|здравствуй\w*|добр\w+ (утро|день|вечер)|хай|салют|hi|hello)[\s!.,)]*$/i;
const THANKS = /^(спасибо|благодарю|спс|пока|до свидания)( большое| огромное| вам)?[\s!.,)]*$/i;
const NO_PROBLEM =
  /^(ничего( не (случилось|произошло|нужно|надо))?|вс[её] (хорошо|нормально|в порядке|работает|ок)|нет( проблем)?|не надо|уже (не надо|работает|починил\w*|разобрал\w*)|разобрал\w*|отбой|проблем нет)[\s!.,)]*$/i;

/**
 * Разговор с самим помощником, а не обращение (ТЗ v4.15): кто ты, как зовут, что умеешь, ты бот,
 * как дела, с кем я говорю, расскажи о себе, ты меня понимаешь. Со знаком вопроса или без —
 * это не задача. Держать в синхроне с packages/shared (isChitChat).
 */
export const ABOUT_ASSISTANT = new RegExp(
  '^(а |ну |слушай,? |скажи,? |и )?(' +
    [
      '(кто|что) (ты|вы)( (такой|такая|такие|такое|сейчас|вообще|есть|здесь|там))*',
      '(ты|вы) кто( (такой|такая|такие|сейчас|вообще))*',
      'как (тебя|вас) (зовут|звать|называть)',
      'как (твоё|твое|ваше) имя',
      '(есть ли )?у (тебя|вас) (есть )?имя',
      '(что|чем|чего) (ты|вы) (умеешь|умеете|можешь|можете|знаешь|знаете|занимаешься|занимаетесь)( делать)?( вообще| сейчас| ещё| еще)?',
      'чем (ты|вы) (можешь|можете) помочь',
      '(ты|вы) (бот|робот|человек|живой|живая|живые|нейросеть|ии|ai|искусственный интеллект|программа|настоящий|настоящая|реальный|тут|здесь)',
      '(ты|вы) меня (слышишь|слышите|понимаешь|понимаете|видишь|видите)',
      'с кем я (говорю|разговариваю|общаюсь|переписываюсь)',
      '(расскажи|расскажите) (о себе|про себя|немного о себе)',
      '(ну )?(а )?как (у тебя |у вас )?(дела|жизнь|ты|вы|поживаешь|поживаете|настроение|сам|сама)',
      'как (твои|ваши) дела',
      '(ты|вы) (умный|умная|глупый|глупая|классный|классная|молодец|лучший|лучшая|хороший|хорошая)',
    ].join('|') +
    ')[\\s?!.,)]*$',
  'i',
);
const CHAT = ABOUT_ASSISTANT;

/** Сообщение — просто реплика, без проблемы или вопроса. */
export function isSmalltalk(text: string): boolean {
  const t = text.trim();
  return (
    looksMeaningless(t) || GREETING.test(t) || THANKS.test(t) || NO_PROBLEM.test(t) || CHAT.test(t)
  );
}

/**
 * Живой ответ, когда обращения пока нет (демо-режим и запасной вариант для модели).
 * Учитывает последнюю реплику и не повторяет один и тот же текст.
 */
export function mockReply(text: string, history: ChatMessage[] = []): string {
  const last = text.trim().split('\n').filter(Boolean).at(-1)?.trim() ?? '';
  const asked = history.filter((m) => m.role === 'assistant').length;
  if (GREETING.test(last)) return 'Здравствуйте! Я помогу разобраться. Что случилось?';
  if (THANKS.test(last))
    return 'Пожалуйста! Если появится что-то ещё — пишите сюда. Это обращение можно закрыть.';
  if (NO_PROBLEM.test(last))
    return 'Отлично, что всё в порядке! Тогда обращение можно закрыть. Если что-то случится — просто напишите сюда.';
  if (CHAT.test(last))
    return /дела|жизнь|поживаешь|поживаете|настроение/i.test(last)
      ? 'Всё хорошо, спасибо! А у вас? Если что-то не работает или нужна помощь — расскажите.'
      : 'Я помощник поддержки: помогаю разобраться с компьютером, программами, почтой и доступами. Расскажите, что случилось?';
  if (/^(тест|test)$/i.test(last)) return 'Связь есть, сообщения доходят. Чем могу помочь?';
  if (asked === 0)
    return last.length <= 3
      ? `Кажется, сообщение ушло случайно — пришло только «${last}». Что у вас случилось?`
      : 'Пока не понял, с чем нужна помощь. Расскажите, что не работает или что хотите сделать?';
  return 'Всё ещё не могу понять, о чём речь. Напишите в двух словах, например: «не открывается почта» или «как подключить принтер».';
}

export function unclearTriage(text: string, reply = mockReply(text)): Triage {
  return {
    meaningful: false,
    reply,
    summary: 'Обращение пока непонятно',
    service: 'Не определён',
    facts: [],
    missing: [],
    urgency: 'normal',
    urgency_reason: '',
    mode: 'steps',
    structure: 'loose',
    difficulty: 'easy',
    title: text.trim().split('\n')[0]!.slice(0, 60) || 'Новое обращение',
    estimated_seconds: 10,
  };
}

/** Строки обращения, в которых есть суть (без «F», «привет», «ничего не случилось»). */
export function meaningfulLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isSmalltalk(l));
}

/** Оформить, записаться, заказать — заявка, а не вопрос (ТЗ v4.13). */
const REQUEST_MODE =
  /(записат|запись на|записью|оформ|заказат|сделать заказ|вернуть (товар|заказ|деньги)|возврат|получить (справк|документ|паспорт|выписк)|подать заявлен)/i;

/** Просьба к человеку что-то сообщить — встречный вопрос, даже без «?». */
const ASKS_USER = new RegExp(
  // «уточните», «сообщите», «пришлите», «укажите», «выберите» — в любом месте фразы;
  // «напишите», «расскажите», «опишите» — только в начале фразы (не «если не выйдет — напишите»)
  '(?<![а-яё])(уточните|сообщите|пришлите|укажите|выберите|уточни|сообщи|пришли|укажи|выбери)(?![а-яё])|' +
    '(^|[.!:]\\s+|\\n)(напишите|расскажите|опишите|подскажите|напиши|расскажи|опиши)(?![а-яё])',
  'i',
);
const COURTESY =
  /(^|[.!…]\s+)(это |ну как, )?(помогло|получилось|сработало|удалось|понятно|ясно|всё понятно|всё получилось|остались (ли )?(ещё )?вопросы|есть (ли )?(ещё )?вопросы|могу (ли )?(я )?(ещё )?(чем-(то|нибудь) )?помочь|нужна (ли )?(ещё )?(какая-(то|нибудь) )?помощь|что-(то|нибудь) ещё|чем (ещё )?(могу )?помочь)[^.!?\n]*\?\s*[)»"]*\s*$/i;

/**
 * Запасная оценка ответа (без ИИ или если оценка не удалась): просит ли помощник данные.
 * Вежливое «Помогло?» в конце — не вопрос; инструкция со списком шагов — не вопрос,
 * а список из одних вопросов — вопрос.
 */
export function asksForInfo(text: string): boolean {
  const full = text.replace(/```[\s\S]*?```/g, '').trim();
  if (!full) return false;
  const plain = full.replace(COURTESY, '$1').trim();
  if (plain !== full && !ASKS_USER.test(plain)) return false;
  const items = plain.split('\n').filter((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l));
  if (items.length) return items.every((l) => /\?\s*$/.test(l));
  if (plain.length > 900) return false;
  const last =
    plain
      .split(/\n+/)
      .filter((l) => l.trim())
      .at(-1) ?? '';
  return /\?\s*[)»"]*\s*$/.test(last) || ASKS_USER.test(plain);
}

export function mockAssess(text: string): AnswerOutcome {
  return asksForInfo(text)
    ? { state: 'need_info', question: '', buttons: [] }
    : { state: 'final', question: '', buttons: [] };
}

export function mockTriage(text: string, history: ChatMessage[] = []): Triage {
  const lines = meaningfulLines(text);
  if (!lines.length) return unclearTriage(text, mockReply(text, history));
  text = lines.join('\n');
  const c = mockClassify(text);
  const urgent = URGENT.test(text);
  const mode = ESCALATE.test(text)
    ? 'escalate'
    : REQUEST_MODE.test(text)
      ? 'request'
      : QUESTION.test(text.trim()) || ARITHMETIC.test(text.trim())
        ? 'answer'
        : 'steps';
  const vague = text.length < 70 && mode !== 'answer' && mode !== 'request';
  return {
    meaningful: true,
    reply: '',
    summary: text.length > 140 ? `${text.slice(0, 137)}…` : text,
    service: SERVICES.find(([re]) => re.test(text))?.[1] ?? 'Не определён',
    facts: text
      .split(/[.!?\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 8)
      .slice(0, 4),
    missing:
      vague && !urgent
        ? ['Что именно происходит: текст ошибки или что видно на экране', 'С какого устройства']
        : [],
    urgency: urgent ? 'critical' : mode === 'answer' ? 'low' : 'normal',
    urgency_reason: urgent
      ? 'Упомянут близкий дедлайн — работа заблокирована.'
      : 'Демо-режим: оценка по ключевым словам.',
    mode,
    structure: vague ? 'loose' : c.structure,
    difficulty: text.length > 160 ? 'hard' : c.difficulty,
    title: c.title,
    estimated_seconds: c.estimated_seconds,
  };
}

export function mockSupportQuestions(focus: string[], urgent: boolean): QuestionsResult {
  const qs = [
    {
      text: 'Что видно на экране, когда проблема появляется?',
      options: ['Сообщение об ошибке', 'Ничего не происходит', 'Долго грузится', 'Не знаю'],
    },
    {
      text: 'С какого устройства вы работаете?',
      options: ['Рабочий ноутбук', 'Личный компьютер', 'Телефон', 'Не знаю'],
    },
  ];
  return {
    intro: 'Чтобы не гадать, уточню главное.',
    questions: focus.length ? qs.slice(0, urgent ? 1 : focus.length) : [],
  };
}

export function mockSteps(urgent: boolean, attempt: number): StepsResult {
  if (attempt > 1)
    return {
      intro: 'Попробуем другой подход.',
      steps: [
        {
          title: 'Очистить кэш браузера',
          instruction:
            'Нажмите Ctrl+Shift+Delete, отметьте «Кэш» и «Cookie» и удалите данные за всё время.',
          check: 'Данные очистились?',
          yes: 'Да, очистил',
          no: 'Нет, не выходит',
        },
        {
          title: 'Войти в режиме инкогнито',
          instruction: 'Откройте окно инкогнито (Ctrl+Shift+N) и попробуйте войти ещё раз.',
          check: 'Получилось войти?',
          yes: 'Да, вошёл',
          no: 'Нет, не пускает',
        },
      ],
      self_solvable: true,
      escalate_reason: '',
    };
  return {
    intro: urgent
      ? 'Сначала — быстрый обходной путь, чтобы вы успели, потом разберёмся с причиной.'
      : 'Пройдём по шагам — от простого к сложному.',
    steps: [
      ...(urgent
        ? [
            {
              title: 'Войти с телефона',
              instruction:
                'Если с телефона система открывается — используйте его для встречи прямо сейчас.',
              check: 'Подключились к встрече?',
              yes: 'Да, я на встрече',
              no: 'Нет, не выходит',
            },
          ]
        : []),
      {
        title: 'Перезапустить браузер',
        instruction: 'Закройте все окна браузера и откройте заново. Попробуйте войти.',
        check: 'Система открылась?',
        yes: 'Да, открылась',
        no: 'Нет, не открывается',
      },
      {
        title: 'Проверить VPN',
        instruction: 'Проверьте, что значок VPN в трее зелёный. Если нет — подключитесь заново.',
        check: 'Значок VPN зелёный?',
        yes: 'Да, зелёный',
        no: 'Нет, серый',
      },
      {
        title: 'Перезагрузить ноутбук',
        instruction: 'Сохраните работу и перезагрузите ноутбук через Пуск → Перезагрузка.',
        check: 'После перезагрузки заработало?',
        yes: 'Да, работает',
        no: 'Нет, всё так же',
      },
    ],
    self_solvable: true,
    escalate_reason: '',
  };
}

export function mockHandoff(history: ChatMessage[]): HandoffResult {
  const tried = history
    .filter((m) => m.role === 'user' && /^Шаг/.test(m.content))
    .map((m) => m.content.replace(/^Шаг\s*/, ''));
  return {
    hypothesis: 'Демо-режим: гипотезу сформулирует модель, когда будет подключена Ollama.',
    actions: tried,
    result: tried.length
      ? 'Проблема сохраняется после выполненных шагов.'
      : 'Самостоятельно не решалось.',
    notes: '',
  };
}

// ——— Разделы: раскладка по совпадению основ слов (демо-режим и запасной вариант) ———

const STOP = new Set([
  'зада',
  'кото',
  'друг',
  'все',
  'что',
  'для',
  'как',
  'или',
  'это',
  'сюда',
  'разн',
  'тако',
]);

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .match(/\p{L}{3,}/gu) ?? []) {
    // грубая «основа» слова: почта / почтой / почты → «почт»
    const stem = w.slice(0, 4);
    if (!STOP.has(stem)) out.add(stem);
  }
  return out;
}

export function mockSort(sections: SectionRef[], items: SortItem[]): SortResult {
  const keys = sections.map((s) => ({
    id: s.id,
    stems: stems(`${s.name} ${s.description ?? ''}`),
  }));
  const assign: Record<string, string[]> = {};
  for (const it of items) {
    const words = stems(it.text);
    assign[it.id] = keys.filter((k) => [...k.stems].some((x) => words.has(x))).map((k) => k.id);
  }
  return { assign };
}
