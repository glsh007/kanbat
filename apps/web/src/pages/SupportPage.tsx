import { Headset, Kanban, MessagesSquare } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { clip } from '@/features/nav/history';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { useRole } from '@/features/board/store';
import {
  isQueue,
  LONG_WAIT_MIN,
  minutesSince,
  queueInfo,
  queuePath,
  ticketPath,
  type Queue,
  type SupportSort,
  type SupportView,
} from '@/features/support/data';
import { SpecialistPanel } from '@/features/support/SpecialistPanel';
import { SupportBoard } from '@/features/support/SupportBoard';
import { SupportChat } from '@/features/support/SupportChat';
import { useTickets } from '@/features/support/tickets';
import { AppShell } from '@/layout/AppShell';
import { cn } from '@/lib/cn';
import { logout, useUser } from '@/lib/session';
import { safeStorage } from '@/lib/storage';
import { useNow } from '@/lib/useNow';

const PREFS = 'kc-support-view';
type Prefs = { sort: SupportSort; view: SupportView };

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(safeStorage.get(PREFS) ?? 'null') as Partial<Prefs> | null;
    return {
      sort: v?.sort === 'wait' ? 'wait' : 'urgency',
      // по умолчанию — доска: главный канбан продукта
      view: v?.view === 'chat' ? 'chat' : 'board',
    };
  } catch {
    return { sort: 'urgency', view: 'board' };
  }
}

const VIEWS: SegmentedOption<SupportView>[] = [
  { id: 'board', label: 'Доска', icon: Kanban, title: 'Канбан заявок по статусам' },
  { id: 'chat', label: 'Чат', icon: MessagesSquare, title: 'Список заявок и переписка' },
];

/**
 * Пульт поддержки (ТЗ v4.4, п. 14): рабочее место специалиста.
 * Очередь выбирается в меню, вид — «Доска» (канбан) или «Чат» (список + переписка).
 */
export function SupportPage() {
  const { taskId, queue: queueParam } = useParams();
  const navigate = useNavigate();
  const role = useRole();
  const error = useTickets((s) => s.error);
  const tickets = useTickets((s) => s.tickets);
  const me = useUser();
  const now = useNow();
  const queue: Queue = isQueue(queueParam) ? queueParam : 'all';
  const close = useCallback(() => navigate(queuePath(queue)), [navigate, queue]);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      safeStorage.set(PREFS, JSON.stringify(next));
      return next;
    });

  // сводка для шапки: сколько ждут ответа, из них срочных и давно ждущих
  const summary = useMemo(() => {
    const open = tickets.filter(
      (t) => t.escalation.status === 'new' || t.escalation.status === 'in_progress',
    );
    return {
      waiting: open.length,
      urgent: open.filter((t) => t.escalation.handoff.urgency === 'critical').length,
      long: open.filter((t) => minutesSince(t.escalation.createdAt, now) >= LONG_WAIT_MIN).length,
    };
  }, [tickets, now]);
  const openTicket = taskId ? tickets.find((t) => t.taskId === taskId) : undefined;
  useNavTitle(
    openTicket
      ? `заявка «${clip(openTicket.title)}»`
      : `пульт: ${queue === 'all' ? 'все заявки' : queueInfo(queue).label.toLowerCase()}`,
  );

  if (role !== 'specialist')
    return (
      <AppShell title="Пульт поддержки" subtitle="Только для специалистов поддержки">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <Headset size={40} aria-hidden className="text-fg-muted" />
          <h2 className="text-lg">Доступ только для специалистов поддержки</h2>
          <p className="text-fg-muted">
            Здесь заявки, которые ИИ передал людям. Чтобы отвечать на них, выйдите и войдите как
            специалист с кодом доступа.
          </p>
          <Button onClick={() => void logout()}>Выйти и войти как специалист</Button>
          <Button variant="ghost" onClick={() => navigate('/')}>
            К моим обращениям
          </Button>
        </div>
      </AppShell>
    );

  // неизвестная очередь в адресе — на «Все заявки»
  if (queueParam && !isQueue(queueParam)) return <Navigate to="/support" replace />;

  const title = queue === 'all' ? 'Пульт поддержки' : queueInfo(queue).label;
  const subtitle = error
    ? `Нет связи с сервером: ${error}`
    : summary.waiting === 0
      ? 'Все заявки разобраны'
      : [
          `Ждут ответа: ${summary.waiting}`,
          summary.urgent ? `срочных: ${summary.urgent}` : '',
          summary.long ? `дольше ${LONG_WAIT_MIN} мин: ${summary.long}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-2">
          <Segmented
            value={prefs.view}
            onChange={(v) => setPrefs({ view: v })}
            options={VIEWS}
            label="Вид пульта"
          />
          <label htmlFor="support-sort" className="sr-only">
            Сортировка
          </label>
          <select
            id="support-sort"
            value={prefs.sort}
            onChange={(e) => setPrefs({ sort: e.target.value as SupportSort })}
            className={cn(fieldClass.replace('w-full', ''), 'hidden h-9 w-auto text-sm sm:block')}
          >
            <option value="urgency">Сначала срочные</option>
            <option value="wait">Дольше ждут</option>
          </select>
        </div>
      }
      wallpaper={prefs.view === 'board'}
    >
      {prefs.view === 'chat' ? (
        <SupportChat
          queue={queue}
          sort={prefs.sort}
          meId={me?.id ?? null}
          activeId={taskId}
          onClose={close}
        />
      ) : (
        <div className="flex min-h-full md:h-full">
          <div className="min-w-0 flex-1">
            <SupportBoard
              activeId={taskId}
              onOpen={(id) => navigate(ticketPath(queue, id))}
              queue={queue}
              sort={prefs.sort}
              meId={me?.id ?? null}
            />
          </div>
          {taskId && <SpecialistPanel key={taskId} taskId={taskId} onClose={close} />}
        </div>
      )}
    </AppShell>
  );
}
