import type { CommunityDraft, CommunityProposal, ForumSection } from '@app/shared';
import { Archive, MoreHorizontal, Pencil, Plus, ScrollText, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useRole } from '@/features/board/store';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural, timeAgo } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { CommunityDialog, type CommunityDialogMode } from './CommunityDialog';
import { CommunityIcon } from './community';
import { ForumFlash } from './parts';
import { FORUM_NAME, handle, useForumFlash, useReviewCount } from './sections';
import { useForumSections } from './sections';

const RULES = [
  'Одна проблема — одна тема. Название — как вопрос, который ищут.',
  'Без паролей, телефонов и личных данных.',
  'Помогло — отметьте ответ «Полезно», а автор — «Решение».',
  'Спам или не то сообщество — нажмите «⋯» → «Пожаловаться».',
  'Будьте доброжелательны: здесь все коллеги.',
];

/** Меню сообщества для специалиста: изменить, в архив. */
function communityMenu(
  section: ForumSection | undefined,
  specialist: boolean,
  on: (a: 'edit' | 'archive') => void,
): MenuItem[] {
  if (!section || !specialist) return [];
  return [
    {
      id: 'edit',
      label: 'Изменить сообщество',
      icon: <Pencil size={16} />,
      onSelect: () => on('edit'),
    },
    ...(section.id !== 'other'
      ? [
          {
            id: 'archive',
            label: 'В архив',
            icon: <Archive size={16} />,
            onSelect: () => on('archive'),
          } as MenuItem,
        ]
      : []),
  ];
}

/** Левая колонка: о сообществе (или о Бат-Форуме целиком), статистика, правила. */
function CommunityInfo({
  section,
  sections,
  onCreate,
  menu,
}: {
  section?: ForumSection;
  sections: ForumSection[];
  onCreate: () => void;
  menu: MenuItem[];
}) {
  const now = useNow();
  const total = sections.reduce(
    (a, s) => ({
      threads: a.threads + s.threads,
      solved: a.solved + s.solved,
      unanswered: a.unanswered + s.unanswered,
    }),
    { threads: 0, solved: 0, unanswered: 0 },
  );
  const topics = (n: number) => plural(n, 'тема', 'темы', 'тем');
  const stats: [number, string][] = section
    ? [
        [section.threads, topics(section.threads)],
        [section.solved, 'решено'],
        [section.members, plural(section.members, 'участник', 'участника', 'участников')],
      ]
    : [
        [total.threads, topics(total.threads)],
        [total.solved, 'решено'],
        [total.unanswered, plural(total.unanswered, 'ждёт ответа', 'ждут ответа', 'ждут ответа')],
      ];

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label={section ? `О сообществе ${handle(section)}` : `О ${FORUM_NAME}е`}
        className="overflow-hidden rounded-panel border border-line bg-surface"
      >
        {/* «баннер» сообщества — мягкая полоса, как шапка сообщества на Reddit */}
        <div aria-hidden className="h-12 bg-accent-soft" />
        <div className="-mt-6 flex flex-col gap-3 px-4 pb-4">
          <div className="flex items-end justify-between gap-2">
            <span className="inline-flex rounded-full ring-4 ring-surface">
              <CommunityIcon icon={section?.icon} size={48} />
            </span>
            {menu.length > 0 && (
              <Menu
                label="Действия с сообществом"
                icon={<MoreHorizontal size={18} />}
                items={menu}
                triggerClassName="size-9"
              />
            )}
          </div>
          <div>
            <h2 className="font-serif text-lg leading-tight font-medium">
              {section ? section.name : FORUM_NAME}
            </h2>
            <p className="text-sm text-fg-muted">{section ? handle(section) : 'б/все'}</p>
          </div>
          <p className="text-sm leading-relaxed">
            {section
              ? section.description
              : 'Сообщество сотрудников: похожие проблемы и ответы коллег. Часто решение уже есть — поищите, прежде чем создавать обращение.'}
          </p>
          <dl className="grid grid-cols-3 gap-2 border-y border-line py-3">
            {stats.map(([n, label], i) => (
              <div key={i} className="flex flex-col">
                <dt className="order-2 text-xs text-fg-muted">{label}</dt>
                <dd className="order-1 text-base font-semibold text-heading tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          {section?.activityAt && (
            <p className="text-xs text-fg-muted">
              Последняя активность: {timeAgo(section.activityAt, now)}
            </p>
          )}
          <Button icon={<Plus size={16} />} onClick={onCreate} className="w-full">
            Создать тему
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="forum-rules-h"
        className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4"
      >
        <h2 id="forum-rules-h" className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText size={16} aria-hidden /> Правила
        </h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg-muted marker:text-fg-muted">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>

      <section className="flex items-start gap-2 rounded-panel border border-line bg-surface p-4 text-sm">
        <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
        <p>
          <span className="font-semibold text-heading">Модераторы:</span>{' '}
          <span className="text-fg-muted">
            специалисты поддержки — отмечают решения, закрепляют полезное, переносят и закрывают
            темы, разбирают жалобы и предложения сообществ.
          </span>
        </p>
      </section>
    </div>
  );
}

/** Правая колонка (за чертой): список сообществ. */
function CommunityList({
  sections,
  current,
  onAdd,
  addLabel,
  proposals,
}: {
  sections: ForumSection[];
  current?: string;
  onAdd: () => void;
  addLabel: string;
  proposals: CommunityProposal[];
}) {
  const item = (active: boolean) =>
    cn(
      'flex items-center gap-2.5 rounded-control px-2 py-2 transition-colors duration-200',
      active ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-surface',
    );
  return (
    <nav aria-label="Сообщества" className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 pb-1 pl-2">
        <h2 className="text-xs font-medium text-fg-muted">Сообщества</h2>
        <IconButton label={addLabel} icon={<Plus size={16} />} size="sm" onClick={onAdd} />
      </div>
      <Link to="/forum" aria-current={!current ? 'page' : undefined} className={item(!current)}>
        <CommunityIcon size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-heading">б/все</span>
          <span className="truncate text-xs text-fg-muted">Рекомендации</span>
        </span>
      </Link>
      {sections.map((s) => (
        <Link
          key={s.id}
          to={`/forum/s/${s.id}`}
          aria-current={s.id === current ? 'page' : undefined}
          className={item(s.id === current)}
        >
          <CommunityIcon icon={s.icon} size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-heading">{handle(s)}</span>
            <span className="truncate text-xs text-fg-muted">{s.name}</span>
          </span>
          <span className="text-xs text-fg-muted tabular-nums">
            <span className="sr-only">Тем: </span>
            {s.threads}
          </span>
        </Link>
      ))}
      <MyProposals proposals={proposals} />
    </nav>
  );
}

const PROPOSAL_STATUS: Record<string, string> = {
  proposed: 'ждёт специалиста',
  active: 'одобрено',
  rejected: 'отклонено',
};

/** Сотруднику — его предложения сообществ и что с ними решили. */
function MyProposals({ proposals }: { proposals: CommunityProposal[] }) {
  const mine = proposals.filter((p) => p.mine);
  if (!mine.length) return null;
  return (
    <section aria-label="Мои предложения" className="mt-4 flex flex-col gap-1.5 px-2">
      <h3 className="text-xs font-medium text-fg-muted">Мои предложения</h3>
      <ul className="flex flex-col gap-1.5">
        {mine.map((p) => (
          <li key={p.id} className="flex flex-col text-sm">
            <span className="truncate font-medium text-heading">б/{p.slug}</span>
            <span className="text-xs text-fg-muted">
              {PROPOSAL_STATUS[p.status] ?? p.status}
              {p.note ? `: ${p.note}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Узкий экран: сообщества — лентой чипов, «о сообществе» — компактной шапкой. */
function CompactHeader({
  section,
  sections,
  onCreate,
  onAdd,
  addLabel,
  menu,
}: {
  section?: ForumSection;
  sections: ForumSection[];
  onCreate: () => void;
  onAdd: () => void;
  addLabel: string;
  menu: MenuItem[];
}) {
  const chip = (active: boolean) =>
    cn(
      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-1 text-sm transition-colors duration-200',
      active
        ? 'bg-surface font-medium text-heading shadow-card ring-1 ring-line'
        : 'text-fg-muted hover:bg-surface hover:text-fg',
    );
  return (
    <div className="flex flex-col gap-3 xl:hidden">
      <nav aria-label="Сообщества" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
        <Link to="/forum" className={chip(!section)}>
          <CommunityIcon size={24} /> б/все
        </Link>
        {sections.map((s) => (
          <Link key={s.id} to={`/forum/s/${s.id}`} className={chip(s.id === section?.id)}>
            <CommunityIcon icon={s.icon} size={24} /> {handle(s)}
          </Link>
        ))}
        <button type="button" onClick={onAdd} className={chip(false)}>
          <span className="grid size-6 place-items-center">
            <Plus size={16} aria-hidden />
          </span>
          {addLabel}
        </button>
      </nav>
      <div className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
        <CommunityIcon icon={section?.icon} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-base font-medium text-heading">
            {section ? section.name : FORUM_NAME}
          </p>
          <p className="truncate text-xs text-fg-muted">
            {(() => {
              const threads = section
                ? section.threads
                : sections.reduce((a, s) => a + s.threads, 0);
              const solved = section ? section.solved : sections.reduce((a, s) => a + s.solved, 0);
              return `${section ? handle(section) : 'б/все'} · ${threads} ${plural(threads, 'тема', 'темы', 'тем')} · ${solved} решено`;
            })()}
          </p>
        </div>
        {menu.length > 0 && (
          <Menu
            label="Действия с сообществом"
            icon={<MoreHorizontal size={18} />}
            items={menu}
            triggerClassName="size-9"
          />
        )}
        <Button size="sm" icon={<Plus size={16} />} onClick={onCreate} className="shrink-0">
          <span className="hidden sm:inline">Создать тему</span>
          <span className="sr-only sm:hidden">Создать тему</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Каркас Бат-Форума (как Reddit): слева — о сообществе, по центру — лента или тема,
 * справа за чертой — сообщества. На узком экране колонки сворачиваются.
 */
export function ForumLayout({
  sectionId,
  onCreate,
  children,
}: {
  sectionId?: string;
  onCreate: () => void;
  children: ReactNode;
}) {
  const sections = useForumSections((s) => s.sections);
  const proposals = useForumSections((s) => s.proposals);
  const load = useForumSections((s) => s.load);
  const loadProposals = useForumSections((s) => s.loadProposals);
  const flash = useForumFlash((s) => s.show);
  const refreshReview = useReviewCount((s) => s.refresh);
  const specialist = useRole() === 'specialist';
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<CommunityDialogMode | null>(null);
  const [archiving, setArchiving] = useState(false);
  useEffect(() => {
    void load();
    void loadProposals();
  }, [load, loadProposals]);
  const section = sections.find((s) => s.id === sectionId);
  const addLabel = specialist ? 'Новое сообщество' : 'Предложить сообщество';
  const onAdd = () => setDialog(specialist ? 'create' : 'propose');
  const menu = communityMenu(section, specialist, (a) =>
    a === 'edit' ? setDialog('edit') : setArchiving(true),
  );

  const submit = async (d: CommunityDraft) => {
    if (dialog === 'edit' && section) {
      await forumApi.updateSection(section.id, d);
      flash('Сообщество обновлено');
    } else {
      const r = await forumApi.createSection(d);
      if (r.status === 'active') {
        flash(`Сообщество ${handle(r.section)} создано`);
        navigate(`/forum/s/${r.section.id}`);
      } else {
        flash('Предложение отправлено специалистам');
        if (specialist) void refreshReview();
      }
    }
    setDialog(null);
    void load();
    void loadProposals();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] gap-6 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
      <aside className="hidden w-[272px] shrink-0 xl:block">
        <div className="sticky top-6">
          <CommunityInfo section={section} sections={sections} onCreate={onCreate} menu={menu} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <CompactHeader
          section={section}
          sections={sections}
          onCreate={onCreate}
          onAdd={onAdd}
          addLabel={specialist ? 'Сообщество' : 'Предложить'}
          menu={menu}
        />
        {children}
      </div>

      <aside className="hidden w-[248px] shrink-0 border-l border-line pl-6 lg:block">
        <div className="sticky top-6">
          <CommunityList
            sections={sections}
            current={sectionId}
            onAdd={onAdd}
            addLabel={addLabel}
            proposals={proposals}
          />
        </div>
      </aside>

      <CommunityDialog
        open={dialog !== null}
        mode={dialog ?? 'create'}
        initial={dialog === 'edit' && section ? section : undefined}
        onClose={() => setDialog(null)}
        onSubmit={submit}
      />
      <Dialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title={section ? `Убрать ${handle(section)} в архив?` : 'Убрать в архив?'}
        description={
          section
            ? `Сообщество исчезнет из списка. ${
                section.threads
                  ? `${section.threads} ${plural(section.threads, 'тема переедет', 'темы переедут', 'тем переедут')} в б/разное — с записью в каждой теме.`
                  : 'Тем в нём нет.'
              }`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(false)}>
              Отмена
            </Button>
            <Button
              data-autofocus
              icon={<Archive size={16} />}
              onClick={() => {
                if (!section) return;
                setArchiving(false);
                void forumApi
                  .archiveSection(section.id)
                  .then(() => {
                    flash(`${handle(section)} — в архиве`);
                    void load();
                    navigate('/forum/s/other');
                  })
                  .catch((e: Error) => flash(e.message));
              }}
            >
              В архив
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
      <ForumFlash />
    </div>
  );
}
