import type { CommunitySuggestion, ForumDraft } from '@app/shared';
import { Sparkles } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useBoard } from '@/features/board/store';
import { handle, useForumSections } from './sections';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Раздел по умолчанию (открытый сейчас). */
  sectionId?: string;
  /** Черновик — например, «Поделиться решением» из обращения. */
  draft?: ForumDraft | null;
  /** Тема из решённого обращения — пометка у темы. */
  fromRequest?: boolean;
  title?: string;
  description?: string;
};

/** Новая тема форума: раздел, вопрос, подробности (Markdown). */
export function NewThreadDialog({
  open,
  onClose,
  onCreated,
  sectionId,
  draft,
  fromRequest = false,
  title = 'Новая тема',
  description = 'Опишите вопрос так, чтобы коллеги с такой же проблемой нашли его поиском.',
}: Props) {
  const sections = useForumSections((s) => s.sections);
  const load = useForumSections((s) => s.load);
  const [section, setSection] = useState('other');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<(CommunitySuggestion & { for: string }) | null>(null);
  const sId = useId();
  const tId = useId();
  const bId = useId();

  useEffect(() => {
    if (!open) return;
    if (!sections.length) void load();
    setSection(draft?.sectionId ?? sectionId ?? 'other');
    setName(draft?.title ?? '');
    setBody(draft?.body ?? '');
    setError(null);
    setBusy(false);
    setHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- заполняем при открытии
  }, [open, draft]);

  // Подсказка сообщества (ТЗ v4.7): через ~1,2 с после паузы в наборе; новый ввод отменяет запрос
  const query = `${name.trim()}\n${body.trim().slice(0, 600)}`;
  useEffect(() => {
    if (!open) return;
    const words = name
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (words.length < 2 || name.trim().length < 8) {
      setHint(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      forumApi
        .suggest(name.trim(), body.trim(), useBoard.getState().settings.model, ctrl.signal)
        .then((r) => setHint({ ...r, for: query }))
        .catch(() => undefined);
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query собран из name и body
  }, [open, query]);

  const suggested = hint?.sectionId ? sections.find((s) => s.id === hint.sectionId) : undefined;
  const showSuggest = !!suggested && suggested.id !== section;

  const submit = async () => {
    if (name.trim().length < 5) return setError('Название — хотя бы несколько слов');
    setBusy(true);
    setError(null);
    try {
      const t = await forumApi.create({ sectionId: section, title: name, body, fromRequest });
      void load();
      onCreated(t.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Публикую…' : 'Опубликовать'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={sId} className="text-sm font-medium text-heading">
            Сообщество
          </label>
          <select
            id={sId}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className={cn(fieldClass, 'h-11')}
          >
            {(sections.length ? sections : [{ id: 'other', name: 'Другое' }]).map((s) => (
              <option key={s.id} value={s.id}>
                {'slug' in s ? `${handle(s)} — ${s.name}` : s.name}
              </option>
            ))}
          </select>
          {showSuggest && suggested && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <Sparkles size={14} aria-hidden className="shrink-0 text-fg-muted" />
              <span>
                Похоже, это про <b className="font-semibold text-heading">{handle(suggested)}</b>
              </span>
              <button
                type="button"
                onClick={() => setSection(suggested.id)}
                className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-on-accent-soft transition-colors duration-200 hover:bg-accent-soft/70"
              >
                Выбрать
              </button>
              <span className="text-xs text-fg-muted">
                {hint?.source === 'ai' ? 'подсказка ИИ' : 'по совпадению слов'}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={tId} className="text-sm font-medium text-heading">
            Вопрос
          </label>
          <input
            id={tId}
            data-autofocus
            value={name}
            maxLength={150}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Outlook не получает письма, а в браузере всё есть"
            className={cn(fieldClass, 'h-11')}
          />
          {hint && !hint.looksLikeQuestion && (
            <p className="text-sm text-fg-muted">
              Не похоже на вопрос — напишите, что случилось или что хотите узнать.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={bId} className="text-sm font-medium text-heading">
            Подробности <span className="font-normal text-fg-muted">(необязательно)</span>
          </label>
          <textarea
            id={bId}
            rows={6}
            value={body}
            maxLength={6000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Что делали, что видите на экране, что уже пробовали"
            className={cn(fieldClass, 'resize-y py-2 text-sm leading-relaxed')}
          />
          <p className="text-xs text-fg-muted">
            Не пишите пароли, телефоны и личные данные — тему увидят все пользователи.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
