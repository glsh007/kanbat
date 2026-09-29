import { COMMUNITY_ICONS, type CommunityDraft, type CommunityIconKey } from '@app/shared';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { COMMUNITY_ICON_MAP } from './communityIcons';
import { slugify } from './sections';

export type CommunityDialogMode = 'create' | 'propose' | 'edit' | 'approve';

const TEXT: Record<CommunityDialogMode, { title: string; description: string; submit: string }> = {
  create: {
    title: 'Новое сообщество',
    description: 'Сообщество сразу появится у всех пользователей.',
    submit: 'Создать',
  },
  propose: {
    title: 'Предложить сообщество',
    description:
      'Специалисты поддержки посмотрят предложение и создадут сообщество — или объяснят, почему нет.',
    submit: 'Отправить на одобрение',
  },
  edit: {
    title: 'Изменить сообщество',
    description: 'Ссылки на темы не сломаются: они не зависят от адреса.',
    submit: 'Сохранить',
  },
  approve: {
    title: 'Одобрить сообщество',
    description: 'Можно поправить название, адрес или описание перед созданием.',
    submit: 'Одобрить и создать',
  },
};

type Props = {
  open: boolean;
  mode: CommunityDialogMode;
  initial?: Partial<CommunityDraft>;
  onClose: () => void;
  /** Бросает Error с понятным текстом — он показывается в окне. */
  onSubmit: (d: CommunityDraft) => Promise<void>;
};

/** Создать, предложить, изменить или одобрить сообщество Бат-Форума (ТЗ v4.7). */
export function CommunityDialog({ open, mode, initial, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<CommunityIconKey>('help');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const slugId = useId();
  const descId = useId();
  const iconsId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setSlug(initial?.slug ?? '');
    setSlugTouched(!!initial?.slug);
    setDescription(initial?.description ?? '');
    setIcon(initial?.icon ?? 'help');
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- заполняем при открытии
  }, [open]);

  const shownSlug = slugTouched ? slug : slugify(name);
  const t = TEXT[mode];

  const submit = async () => {
    if (name.trim().length < 3) return setError('Название — хотя бы 3 символа');
    if (description.trim().length < 10) return setError('Опишите в паре слов, о чём сообщество');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), slug: shownSlug, description: description.trim(), icon });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.title}
      description={t.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Сохраняю…' : t.submit}
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
          <label htmlFor={nameId} className="text-sm font-medium text-heading">
            Название
          </label>
          <input
            id={nameId}
            data-autofocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Удалённая работа"
            className={cn(fieldClass, 'h-11')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={slugId} className="text-sm font-medium text-heading">
            Адрес
          </label>
          <div className="flex items-center">
            <span className="inline-flex h-11 items-center rounded-l-control border border-r-0 border-line-strong bg-surface px-3 text-[15px] text-fg-muted">
              б/
            </span>
            <input
              id={slugId}
              value={shownSlug}
              maxLength={24}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="удалёнка"
              aria-describedby={`${slugId}-hint`}
              className={cn(fieldClass, 'h-11 rounded-l-none')}
            />
          </div>
          <p id={`${slugId}-hint`} className="text-xs text-fg-muted">
            Буквы, цифры и дефисы — так сообщество будет подписано в ленте.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={descId} className="text-sm font-medium text-heading">
            О чём сообщество
          </label>
          <textarea
            id={descId}
            rows={2}
            value={description}
            maxLength={140}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="VPN дома, созвоны, доступ к рабочим папкам из дома"
            className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
          />
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-sm font-medium text-heading">Значок</legend>
          {/* обычные радиокнопки: стрелки и Tab работают сами */}
          <div className="grid grid-cols-6 gap-1.5">
            {COMMUNITY_ICONS.map((key) => {
              const { icon: Icon, label } = COMMUNITY_ICON_MAP[key];
              const on = icon === key;
              return (
                <label
                  key={key}
                  title={label}
                  className={cn(
                    'grid h-11 cursor-pointer place-items-center rounded-control transition-colors duration-200',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus',
                    on
                      ? 'bg-accent-soft text-on-accent-soft ring-2 ring-line-strong'
                      : 'text-fg-muted hover:bg-sunken hover:text-fg',
                  )}
                >
                  <input
                    type="radio"
                    name={iconsId}
                    value={key}
                    checked={on}
                    onChange={() => setIcon(key)}
                    className="sr-only"
                  />
                  <span className="sr-only">{label}</span>
                  <Icon size={20} aria-hidden />
                </label>
              );
            })}
          </div>
        </fieldset>
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
