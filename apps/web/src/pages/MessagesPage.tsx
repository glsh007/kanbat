import {
  DM_CLOSE_LABELS,
  type DmArchiveCard,
  type DmArchiveView,
  type DmChatCard,
  type DmMessageView,
  type DmProfile,
} from '@app/shared';
import {
  Archive,
  ArrowLeft,
  ArrowUp,
  Ban,
  CheckCircle2,
  Flag,
  HandHelping,
  MessageCircleQuestion,
  MessagesSquare,
  MoreHorizontal,
  PenLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { ListEdge } from '@/components/ui/ResizeHandle';
import { useDm } from '@/features/dm/store';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { AppShell } from '@/layout/AppShell';
import { dmApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, plural, timeAgo } from '@/lib/format';
import { usePanelWidth } from '@/lib/panelWidth';
import { useNow } from '@/lib/useNow';

/**
 * Бат-общение (ТЗ v4.19, п. 18): не мессенджер, а личный вопрос по теме Бат-Форума тому, кто в ней
 * отвечал. Слева — вопросы вам и переписки или архив; справа — открытая переписка.
 * Переписка закрывается через 3 дня тишины или через 7 дней с начала, «Проблема решена»
 * (спрашивающий) или «Больше помочь не могу» (помогающий) — и уходит в архив каждого.
 */
export function MessagesPage() {
  const { chatId: rawChat, archiveId } = useParams();
  const archiveTab = !!archiveId || rawChat === 'archive';
  const chatId = rawChat && rawChat !== 'archive' ? rawChat : undefined;
  const tick = useDm((s) => s.tick);
  const refresh = useDm((s) => s.refresh);
  const [chats, setChats] = useState<DmChatCard[] | null>(null);
  const [archive, setArchive] = useState<DmArchiveCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listWidth = usePanelWidth('dm-list', 340, 260, 560);
  useNavTitle(archiveTab ? 'архив Бат-общения' : 'Бат-общение');

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([dmApi.chats(), dmApi.archive()]);
      setChats(c);
      setArchive(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, tick]);

  const current = chats?.find((c) => c.id === chatId) ?? null;
  const detail = !!chatId || !!archiveId;
  const changed = () => {
    void load();
    void refresh();
  };

  return (
    <AppShell
      title="Бат-общение"
      subtitle="Личные вопросы по темам Бат-Форума — видите только вы и собеседник"
    >
      <div className="flex h-full min-h-0">
        <aside
          aria-label="Переписки"
          style={{ '--panel-w': `${listWidth.width}px` } as CSSProperties}
          className={cn(
            'scroll-paper min-h-0 w-full flex-col gap-4 overflow-y-auto border-line p-3 sm:p-4 lg:flex lg:w-[var(--panel-w)] lg:shrink-0 lg:border-r',
            detail ? 'hidden' : 'flex',
          )}
        >
          <nav
            aria-label="Разделы Бат-общения"
            className="grid grid-cols-2 gap-1 rounded-control border border-line bg-sunken p-0.5"
          >
            <TabLink to="/messages" active={!archiveTab} icon={<MessagesSquare size={16} />}>
              Переписки{chats?.length ? ` · ${chats.length}` : ''}
            </TabLink>
            <TabLink to="/messages/archive" active={archiveTab} icon={<Archive size={16} />}>
              Архив{archive?.length ? ` · ${archive.length}` : ''}
            </TabLink>
          </nav>
          {error && (
            <p role="alert" className="text-sm font-medium text-heading">
              {error}
            </p>
          )}
          {archiveTab ? (
            <ArchiveList list={archive} activeId={archiveId ?? null} />
          ) : (
            <ChatList chats={chats} activeId={chatId ?? null} />
          )}
        </aside>
        <ListEdge panel={listWidth} label="Ширина списка переписок" />
        <section
          aria-label={archiveId ? 'Переписка из архива' : 'Переписка'}
          className={cn('min-h-0 min-w-0 flex-1 flex-col', detail ? 'flex' : 'hidden lg:flex')}
        >
          {chatId ? (
            <ChatView key={chatId} chatId={chatId} card={current} onChanged={changed} />
          ) : archiveId ? (
            <ArchiveView key={archiveId} id={archiveId} onChanged={changed} />
          ) : (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center text-sm text-fg-muted">
              <MessageCircleQuestion size={32} aria-hidden className="opacity-60" />
              <p>
                Здесь личные вопросы по темам Бат-Форума. Нашли тему со своей проблемой — нажмите
                «Спросить лично» у ответа того, кто знает решение.
              </p>
              <Link
                to="/forum"
                className="font-medium text-fg underline underline-offset-4 hover:text-heading"
              >
                Открыть Бат-Форум
              </Link>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function TabLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] px-2 text-sm transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        active ? 'bg-surface font-medium text-heading shadow-card' : 'text-fg-muted hover:text-fg',
      )}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </Link>
  );
}

function RoleChip({ role }: { role: 'seeker' | 'helper' }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-sunken px-2 text-[11px] font-medium text-fg-muted ring-1 ring-line">
      {role === 'seeker' ? 'Вы спрашиваете' : 'Вы помогаете'}
    </span>
  );
}

function ChatList({ chats, activeId }: { chats: DmChatCard[] | null; activeId: string | null }) {
  const now = useNow();
  if (!chats) return <p className="text-sm text-fg-muted">Загрузка…</p>;
  if (!chats.length)
    return (
      <p className="text-sm text-fg-muted">
        Открытых переписок нет. Задать личный вопрос можно в теме Бат-Форума — кнопкой «Спросить
        лично» у ответа. Закрытые переписки — в архиве.
      </p>
    );
  const incoming = chats.filter((c) => c.status === 'pending' && c.role === 'helper');
  const rest = chats.filter((c) => !incoming.includes(c));
  const item = (c: DmChatCard) => (
    <li key={c.id}>
      <Link
        to={`/messages/${c.id}`}
        aria-current={c.id === activeId ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-card px-2 py-2.5 transition-colors duration-200 hover:bg-sunken',
          'focus-visible:outline-2 focus-visible:outline-focus',
          c.id === activeId && 'bg-accent-soft',
        )}
      >
        <Avatar name={c.with.name} userId={c.with.id} avatar={c.with.avatar} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-medium text-fg">{c.with.name}</span>
            <span className="ml-auto shrink-0 text-xs text-fg-muted">{timeAgo(c.lastAt, now)}</span>
          </span>
          <span className="block truncate text-xs text-fg-muted">Тема: {c.topic.title}</span>
          <span className="block truncate text-sm text-fg-muted">
            {c.status === 'pending' && c.role === 'seeker'
              ? 'Вопрос отправлен — ждём ответа'
              : c.status === 'pending'
                ? 'Задаёт вам вопрос'
                : c.last
                  ? `${c.last.mine ? 'Вы: ' : ''}${c.last.text}`
                  : 'Переписка открыта'}
          </span>
        </span>
        {c.unread > 0 && (
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary tabular-nums">
            <span className="sr-only">Непрочитанных: </span>
            {c.unread}
          </span>
        )}
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      {incoming.length > 0 && (
        <section aria-labelledby="dm-req">
          <h2 id="dm-req" className="px-2 pb-1 text-xs font-medium text-fg-muted">
            Вопросы вам · {incoming.length}
          </h2>
          <ul className="flex flex-col gap-0.5">{incoming.map(item)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section aria-labelledby="dm-chats">
          <h2 id="dm-chats" className="px-2 pb-1 text-xs font-medium text-fg-muted">
            Переписки
          </h2>
          <ul className="flex flex-col gap-0.5">{rest.map(item)}</ul>
        </section>
      )}
    </div>
  );
}

function ArchiveList({
  list,
  activeId,
}: {
  list: DmArchiveCard[] | null;
  activeId: string | null;
}) {
  if (!list) return <p className="text-sm text-fg-muted">Загрузка…</p>;
  if (!list.length)
    return (
      <p className="text-sm text-fg-muted">
        Архив пуст. Сюда попадают закрытые переписки — копия хранится в вашем кабинете и видна
        только вам.
      </p>
    );
  return (
    <ul aria-label="Архив" className="flex flex-col gap-0.5">
      {list.map((e) => (
        <li key={e.id}>
          <Link
            to={`/messages/archive/${e.id}`}
            aria-current={e.id === activeId ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-card px-2 py-2.5 transition-colors duration-200 hover:bg-sunken',
              'focus-visible:outline-2 focus-visible:outline-focus',
              e.id === activeId && 'bg-accent-soft',
            )}
          >
            <Avatar name={e.with.name} userId={e.with.id} avatar={e.with.avatar} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-medium text-fg">{e.with.name}</span>
                <span className="ml-auto shrink-0 text-xs text-fg-muted">
                  {formatDate(e.closedAt)}
                </span>
              </span>
              <span className="block truncate text-xs text-fg-muted">
                {e.topic ? `Тема: ${e.topic.title}` : 'Без темы'}
              </span>
              <span className="block truncate text-sm text-fg-muted">
                {DM_CLOSE_LABELS[e.reason]}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** «Закроется через 2 дня, если не будет новых сообщений» / «…: переписка живёт не дольше 7 дней». */
function closesText(card: DmChatCard, now: number) {
  const ms = Date.parse(card.closesAt) - now;
  const h = Math.max(0, Math.round(ms / 3_600_000));
  const d = Math.round(h / 24);
  const when =
    h < 1
      ? 'меньше чем через час'
      : h < 48
        ? `через ${h} ${plural(h, 'час', 'часа', 'часов')}`
        : `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
  if (card.status === 'pending') return `Если вопрос не примут, он закроется ${when}.`;
  return card.closesBy === 'quiet'
    ? `Закроется ${when}, если не будет новых сообщений (не позже 7 дней с начала).`
    : `Закроется ${when}: переписка живёт не дольше 7 дней.`;
}

function TopicLine({ topic }: { topic: { id: string; title: string } | null }) {
  if (!topic) return <span>Без темы</span>;
  return (
    <Link
      to={`/forum/t/${topic.id}`}
      className="truncate underline-offset-4 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-focus"
    >
      Тема: {topic.title}
    </Link>
  );
}

function Messages({
  list,
  withName,
  scrollRef,
  label,
}: {
  list: DmMessageView[];
  withName: string;
  scrollRef?: RefObject<HTMLDivElement>;
  label: string;
}) {
  const now = useNow();
  return (
    <div
      ref={scrollRef}
      // прокручиваемая переписка — доступна с клавиатуры (axe)
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label={label}
      className="scroll-paper min-h-0 flex-1 overflow-y-auto px-3 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-6"
    >
      <p className="mx-auto mb-4 flex max-w-md items-start justify-center gap-1.5 text-center text-xs text-fg-muted">
        <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
        Переписку видите только вы и собеседник — ни ИИ, ни специалисты её не читают. Номера СНИЛС,
        паспорта и карт скрываются.
      </p>
      <ol className="mx-auto flex max-w-2xl flex-col gap-2" aria-label="Сообщения">
        {list.map((m) => (
          <li key={m.id} className={cn('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-[18px] px-4 py-2.5 whitespace-pre-wrap',
                m.mine
                  ? 'rounded-br-[6px] bg-surface text-fg ring-1 ring-line'
                  : 'rounded-bl-[6px] bg-accent-soft text-on-accent-soft',
              )}
            >
              <span className="sr-only">{m.mine ? 'Вы: ' : `${withName}: `}</span>
              {m.text}
            </div>
            <time dateTime={m.createdAt} className="mt-0.5 px-1 text-[11px] text-fg-muted">
              {timeAgo(m.createdAt, now)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Header({
  person,
  topic,
  sub,
  menu,
}: {
  person: DmProfile;
  topic: { id: string; title: string } | null;
  sub: ReactNode;
  menu?: ReactNode;
}) {
  const navigate = useNavigate();
  const openProfile = useDm((s) => s.openProfile);
  return (
    <header className="flex items-start gap-2 border-b border-line px-2 py-2 sm:px-4">
      <IconButton
        label="К списку переписок"
        icon={<ArrowLeft size={20} />}
        onClick={() => navigate('/messages')}
        className="lg:hidden"
      />
      <button
        type="button"
        onClick={() => person.id && openProfile(person.id)}
        className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-focus"
        aria-label={`Профиль: ${person.name}`}
      >
        <Avatar name={person.name} userId={person.id} avatar={person.avatar} size={36} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-heading">{person.name}</span>
        <span className="flex min-w-0 text-xs text-fg-muted">
          <TopicLine topic={topic} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          {sub}
        </span>
      </div>
      {menu}
    </header>
  );
}

function ChatView({
  chatId,
  card,
  onChanged,
}: {
  chatId: string;
  card: DmChatCard | null;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [chat, setChat] = useState<DmChatCard | null>(card);
  const [messages, setMessages] = useState<DmMessageView[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'report' | 'remove' | 'finish' | 'block'>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const r = await dmApi.messages(chatId);
      setChat(r.chat);
      setMessages((prev) => {
        if (prev.length !== r.messages.length)
          requestAnimationFrame(() => scroll.current?.scrollTo({ top: 1e9 }));
        return r.messages;
      });
      setError(null);
    } catch (e) {
      // переписку закрыли (срок, собеседник) или удалили
      setChat(null);
      setError((e as Error).message);
    }
  }, [chatId]);

  useEffect(() => {
    void load().then(onChanged);
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChanged — только после первой загрузки
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Закрыть переписку и перейти к своей копии в архиве. */
  const closeTo = async (fn: () => Promise<{ archiveId?: string | null }>, query = '') => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setDialog(null);
      onChanged();
      navigate(r.archiveId ? `/messages/archive/${r.archiveId}${query}` : '/messages', {
        replace: true,
      });
    } catch (e) {
      setError((e as Error).message);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    await act(() => dmApi.send(chatId, t));
  };

  if (!chat)
    return error ? (
      <div className="m-auto flex flex-col items-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
        <Button
          variant="secondary"
          icon={<Archive size={16} />}
          onClick={() => navigate('/messages/archive')}
        >
          Открыть архив
        </Button>
      </div>
    ) : (
      <p className="m-auto p-6 text-sm text-fg-muted">Загрузка…</p>
    );

  const seeker = chat.role === 'seeker';
  const incoming = chat.status === 'pending' && !seeker;
  return (
    <>
      <Header
        person={chat.with}
        topic={chat.topic}
        sub={
          <>
            <RoleChip role={chat.role} />
            <span>{closesText(chat, now)}</span>
          </>
        }
        menu={
          <Menu
            label="Действия с перепиской"
            icon={<MoreHorizontal size={20} />}
            items={[
              {
                id: 'block',
                label: 'Заблокировать',
                icon: <Ban size={16} />,
                onSelect: () => setDialog('block'),
              },
              {
                id: 'report',
                label: 'Пожаловаться',
                icon: <Flag size={16} />,
                onSelect: () => setDialog('report'),
              },
              {
                id: 'remove',
                label: 'Удалить переписку',
                icon: <Trash2 size={16} />,
                onSelect: () => setDialog('remove'),
              },
            ]}
          />
        }
      />

      <Messages
        list={messages}
        withName={chat.with.name}
        scrollRef={scroll}
        label={`Переписка с ${chat.with.name}`}
      />

      <div className="border-t border-line px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm font-medium text-heading">
              {error}
            </p>
          )}
          {incoming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm">
                <span className="font-medium text-heading">{chat.with.name}</span> задаёт вам вопрос
                по теме. Примете — у вас будет до 7 дней, чтобы помочь.
              </p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void act(() => dmApi.accept(chatId))}
              >
                Принять
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void closeTo(async () => (await dmApi.decline(chatId), {}))}
              >
                Отклонить
              </Button>
            </div>
          ) : chat.status === 'pending' ? (
            <p className="text-sm text-fg-muted">
              Вопрос отправлен. Писать можно, когда человек его примет.
            </p>
          ) : (
            <>
              <form
                className="flex items-end gap-2 rounded-[20px] border border-line bg-surface p-2 pl-4 shadow-card focus-within:border-line-strong"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label htmlFor={inputId} className="sr-only">
                  Сообщение
                </label>
                <textarea
                  id={inputId}
                  rows={1}
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Сообщение по теме…"
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-fg outline-none placeholder:text-fg-muted"
                />
                <IconButton
                  type="submit"
                  label="Отправить"
                  icon={<ArrowUp size={18} />}
                  disabled={busy || !text.trim()}
                  className="bg-primary text-on-primary hover:bg-primary-hover"
                />
              </form>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={seeker ? <CheckCircle2 size={16} /> : <HandHelping size={16} />}
                  disabled={busy}
                  onClick={() => setDialog('finish')}
                >
                  {seeker ? 'Проблема решена' : 'Больше помочь не могу'}
                </Button>
                <span className="text-xs text-fg-muted">
                  Закроет переписку — копия останется в архиве.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <Confirm
        open={dialog === 'finish'}
        title={seeker ? 'Проблема решена?' : 'Завершить помощь?'}
        text={
          seeker
            ? 'Переписка закроется у обоих, копия останется в архиве у каждого. Продолжить потом можно новым вопросом этому же человеку.'
            : `Переписка закроется у обоих, копия останется в архиве у каждого. ${chat.with.name} сможет задать новый вопрос позже.`
        }
        action={seeker ? 'Да, решена' : 'Завершить'}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void closeTo(
            () => (seeker ? dmApi.solve(chatId) : dmApi.end(chatId)),
            seeker ? '?solved=1' : '',
          )
        }
      />
      <Confirm
        open={dialog === 'block'}
        title={`Заблокировать ${chat.with.name}?`}
        text="Переписка закроется, и вы больше не сможете задавать друг другу вопросы. Разблокировать можно в профиле человека."
        action="Заблокировать"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => void closeTo(() => dmApi.block(chatId))}
      />
      <Confirm
        open={dialog === 'remove'}
        title="Удалить переписку?"
        text="Переписка удалится у вас обоих — с сервера целиком, без копий в архиве. Отменить нельзя."
        action="Удалить у обоих"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() => void closeTo(async () => (await dmApi.remove(chatId), {}))}
      />
      <ReportDialog
        open={dialog === 'report'}
        name={chat.with.name}
        onClose={() => setDialog(null)}
        onSend={(reason) => closeTo(() => dmApi.report(chatId, reason))}
      />
    </>
  );
}

function ArchiveView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openAsk = useDm((s) => s.openAsk);
  const [view, setView] = useState<DmArchiveView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dmApi
      .archived(id)
      .then(setView)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (!view)
    return error ? (
      <p role="alert" className="m-auto p-6 text-sm font-medium text-heading">
        {error}
      </p>
    ) : (
      <p className="m-auto p-6 text-sm text-fg-muted">Загрузка…</p>
    );

  const topic = view.topic;
  const solvedNow = params.get('solved') === '1' && view.reason === 'solved';
  return (
    <>
      <Header
        person={view.with}
        topic={topic}
        sub={
          <>
            <RoleChip role={view.role} />
            <span>
              {DM_CLOSE_LABELS[view.reason]} · {formatDate(view.closedAt)}
            </span>
          </>
        }
      />
      {solvedNow && topic && (
        <div
          role="status"
          className="border-b border-line bg-accent-soft px-4 py-3 text-on-accent-soft"
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              Помогло? Можете вместе с {view.with.name} написать подробный пост в теме — он поможет
              тем, у кого та же проблема. Переписка сама туда не попадёт.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon={<PenLine size={16} />}
              onClick={() => navigate(`/forum/t/${topic.id}?reply=1`)}
            >
              Написать в теме
            </Button>
          </div>
        </div>
      )}
      <Messages
        list={view.messages}
        withName={view.with.name}
        label={`Архив: переписка с ${view.with.name}`}
      />
      <div className="border-t border-line px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
          <p className="w-full text-xs text-fg-muted">
            Копия в вашем кабинете — видна только вам. Писать в закрытую переписку нельзя.
          </p>
          {view.canAskAgain && topic && (
            <Button
              size="sm"
              icon={<MessageCircleQuestion size={16} />}
              onClick={() =>
                openAsk({
                  threadId: topic.id,
                  threadTitle: topic.title,
                  user: { id: view.with.id, name: view.with.name, avatar: view.with.avatar },
                })
              }
            >
              Спросить снова
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={16} />}
            onClick={() => setRemoving(true)}
          >
            Удалить из архива
          </Button>
        </div>
      </div>
      <Confirm
        open={removing}
        title="Удалить из архива?"
        text="Удалится ваша копия. У собеседника его копия останется у него."
        action="Удалить"
        busy={busy}
        onClose={() => setRemoving(false)}
        onConfirm={() =>
          void (async () => {
            setBusy(true);
            try {
              await dmApi.removeArchived(id);
              setRemoving(false);
              onChanged();
              navigate('/messages/archive', { replace: true });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          })()
        }
      />
    </>
  );
}

function Confirm({
  open,
  title,
  text,
  action,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  text: string;
  action: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button data-autofocus disabled={busy} onClick={onConfirm}>
            {action}
          </Button>
        </>
      }
    >
      <p className="text-sm">{text}</p>
    </Dialog>
  );
}

function ReportDialog({
  open,
  name,
  onClose,
  onSend,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onSend: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const id = useId();
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Пожаловаться"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            icon={<Flag size={16} />}
            disabled={reason.trim().length < 3}
            onClick={() => void onSend(reason.trim())}
          >
            Отправить жалобу
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-sm font-medium text-heading">
          Что случилось?
        </label>
        <textarea
          id={id}
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Например: пишет не по теме, грубит, присылает рекламу"
          className={cn(fieldClass, 'resize-y py-2 leading-snug')}
        />
        <p className="text-xs text-fg-muted">
          {name} будет заблокирован(а), переписка закроется. Специалисты увидят только его (её)
          последние 10 сообщений в этой переписке — не всю переписку и не ваши сообщения.
        </p>
      </div>
    </Dialog>
  );
}
