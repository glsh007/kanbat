import { SECTION_COLORS, type Section, type SectionColor, type SectionMode } from '@app/shared';
import { Hand, Sparkles } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { SectionDot } from '@/components/ui/SectionDot';
import { nextSectionColor, useBoard, type SectionDraft } from '@/features/board/store';
import { cn } from '@/lib/cn';

const COLOR_NAMES: Record<SectionColor, string> = {
  clay: 'Терракотовый',
  kraft: 'Песочный',
  stone: 'Серый',
  slate: 'Графитовый',
};

const NAME_MAX = 40;

const MODES: { id: SectionMode; label: string; hint: string; icon: typeof Hand }[] = [
  { id: 'auto', label: 'По смыслу', hint: 'ИИ сам добавляет подходящие обращения', icon: Sparkles },
  { id: 'manual', label: 'Вручную', hint: 'Обращения выбираете вы, ИИ не трогает', icon: Hand },
];

type Props = {
  open: boolean;
  /** Раздел для изменения; без него — создание нового. */
  section?: Section;
  onClose: () => void;
  onSave: (draft: SectionDraft) => void;
};

/**
 * Создание и изменение раздела: название, как пополняется (по смыслу — ИИ, вручную — сам человек),
 * описание, цвет.
 */
export function SectionDialog({ open, section, onClose, onSave }: Props) {
  const sections = useBoard((s) => s.sections);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<SectionColor>('clay');
  const [mode, setMode] = useState<SectionMode>('auto');
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const descId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setName(section?.name ?? '');
    setDescription(section?.description ?? '');
    setColor(section?.color ?? nextSectionColor(sections));
    setMode(section?.mode ?? 'auto');
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- заполняем только при открытии
  }, [open, section]);

  const clean = name.trim();
  const taken = sections.some(
    (s) => s.id !== section?.id && s.name.trim().toLowerCase() === clean.toLowerCase(),
  );
  const error = !clean
    ? 'Введите название раздела'
    : taken
      ? 'Раздел с таким названием уже есть'
      : null;

  const submit = () => {
    setTouched(true);
    if (error) return;
    onSave({ name: clean, description, color, mode });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={section ? 'Изменить раздел' : 'Новый раздел'}
      description="Раздел — подборка обращений из «Общего». Убранное из раздела остаётся в «Общем»."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit}>{section ? 'Сохранить' : 'Создать'}</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Почта и связь"
            aria-invalid={touched && !!error}
            aria-describedby={touched && error ? errorId : undefined}
            className={cn(fieldClass, 'h-11')}
          />
          {touched && error && (
            <p id={errorId} className="text-sm font-medium text-heading">
              {error}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-heading">Как пополняется</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map(({ id, label, hint, icon: Icon }) => (
              <label
                key={id}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-control border p-3 transition-colors duration-200',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  mode === id
                    ? 'border-accent bg-accent-soft text-on-accent-soft'
                    : 'border-line text-fg hover:bg-sunken',
                )}
              >
                <input
                  type="radio"
                  name="section-mode"
                  value={id}
                  checked={mode === id}
                  onChange={() => setMode(id)}
                  className="sr-only"
                />
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon size={16} aria-hidden />
                  {label}
                </span>
                <span className="text-xs">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={descId} className="text-sm font-medium text-heading">
            {mode === 'manual' ? 'Описание' : 'Что сюда попадает'}{' '}
            <span className="font-normal text-fg-muted">(необязательно)</span>
          </label>
          <textarea
            id={descId}
            rows={3}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={hintId}
            placeholder={
              mode === 'manual'
                ? 'Например: всё, что нужно закрыть до отпуска'
                : 'Например: Outlook, письма, календарь, Teams, звонки'
            }
            className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
          />
          <p id={hintId} className="text-xs text-fg-muted">
            {mode === 'manual'
              ? 'После создания выберите обращения — кнопка «Добавить обращения».'
              : 'Чем точнее описание, тем точнее ИИ раскладывает задачи.'}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-heading">Цвет метки</legend>
          <div className="flex flex-wrap gap-2">
            {SECTION_COLORS.map((c) => (
              <label
                key={c}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm transition-colors duration-200',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  color === c
                    ? 'border-accent bg-accent-soft text-on-accent-soft'
                    : 'border-line text-fg hover:bg-sunken',
                )}
              >
                <input
                  type="radio"
                  name="section-color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="sr-only"
                />
                <SectionDot color={c} />
                {COLOR_NAMES[c]}
              </label>
            ))}
          </div>
        </fieldset>
        {/* Enter в поле названия отправляет форму */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
