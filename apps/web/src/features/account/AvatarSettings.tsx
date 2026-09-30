import type { User } from '@app/shared';
import { Check, ImagePlus, Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { saveAvatar } from '@/lib/session';
import { brandWords } from '@/brand/orgBrand';

/** Готовые рисунки — летучие мыши в цветах схем (сервер рисует их сам, ТЗ v4.18). */
const PRESETS = [
  { id: 'p1', label: 'Мышь в полёте, терракота' },
  { id: 'p2', label: 'Мышь на перекладине, шалфей' },
  { id: 'p3', label: 'Мышь и луна, море' },
  { id: 'p4', label: 'Мышь в наушниках, слива' },
  { id: 'p5', label: 'Мышь в наушниках, охра' },
  { id: 'p6', label: 'Мышь в полёте, море' },
  { id: 'p7', label: 'Мышь и луна, графит' },
  { id: 'p8', label: 'Мышь на перекладине, терракота' },
];

const OUT = 256; // сторона готовой картинки, px
const FRAME = 240; // сторона рамки обрезки на экране, px
const FILE_MAX = 15 * 1024 * 1024;

/** «Настройки» → «Аватарка»: своё фото (с обрезкой по кругу) или готовый рисунок. */
export function AvatarSettings({ user }: { user: User }) {
  const [file, setFile] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const groupId = useId();
  const current = user.avatar?.startsWith('preset:') ? user.avatar.slice(7) : null;

  const save = async (body: Parameters<typeof saveAvatar>[0], ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveAvatar(body);
      setMessage({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    setMessage(null);
    if (!f.type.startsWith('image/'))
      return setMessage({ ok: false, text: 'Выберите картинку — JPG, PNG или WebP' });
    if (f.size > FILE_MAX) return setMessage({ ok: false, text: 'Файл больше 15 МБ' });
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => setFile(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMessage({
        ok: false,
        text: 'Этот формат браузер не открывает — выберите JPG, PNG или WebP',
      });
    };
    img.src = url;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={user.name} userId={user.id} avatar={user.avatar} size={56} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<ImagePlus size={16} />}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Загрузить фото
          </Button>
          {user.avatar && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={16} />}
              disabled={busy}
              onClick={() =>
                void save({ remove: true }, 'Аватарка убрана — видна первая буква имени.')
              }
            >
              Убрать
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <p id={groupId} className="text-xs text-fg-muted">
        Или выберите рисунок. Аватарку видят все в Канбате: на {brandWords().forumPrep} и в{' '}
        {brandWords().dmPrep}.
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={current === p.id}
            aria-label={p.label}
            title={p.label}
            disabled={busy}
            onClick={() => void save({ preset: p.id }, 'Рисунок выбран.')}
            className={cn(
              'relative rounded-full p-0.5 transition-shadow duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              current === p.id ? 'ring-2 ring-primary' : 'ring-1 ring-line hover:ring-line-strong',
            )}
          >
            <img
              src={`/api/avatars/preset/${p.id}`}
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-full"
            />
            {current === p.id && (
              <span className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-primary text-on-primary">
                <Check size={11} aria-hidden />
              </span>
            )}
          </button>
        ))}
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={cn('text-sm', message.ok ? 'text-fg-muted' : 'font-medium text-heading')}
        >
          {message.text}
        </p>
      )}
      <CropDialog
        image={file}
        busy={busy}
        onClose={() => {
          if (file) URL.revokeObjectURL(file.src);
          setFile(null);
        }}
        onSave={async (photo) => {
          if (await save({ photo }, 'Фото сохранено.')) {
            if (file) URL.revokeObjectURL(file.src);
            setFile(null);
          }
        }}
      />
    </div>
  );
}

/**
 * Обрезка по кругу: перетащите фото (мышью, пальцем или стрелками) и приблизьте.
 * Результат — 256×256 WebP (или JPEG, если браузер WebP не пишет), обычно 10–40 КБ.
 */
function CropDialog({
  image,
  busy,
  onClose,
  onSave,
}: {
  image: HTMLImageElement | null;
  busy: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => Promise<void>;
}) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const zoomId = useId();

  useEffect(() => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, [image]);

  // размер фото в рамке: короткая сторона = рамка × приближение
  const base = image ? FRAME / Math.min(image.naturalWidth, image.naturalHeight) : 1;
  const w = image ? image.naturalWidth * base * zoom : FRAME;
  const h = image ? image.naturalHeight * base * zoom : FRAME;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min((w - FRAME) / 2, Math.max(-(w - FRAME) / 2, p.x)),
    y: Math.min((h - FRAME) / 2, Math.max(-(h - FRAME) / 2, p.y)),
  });
  const at = clamp(pos);

  const move = (dx: number, dy: number) => setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }));

  const onDown = (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: at.x, py: at.y };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
  };

  const render = () => {
    if (!image) return;
    const k = OUT / FRAME; // рамка на экране → 256 px
    const out = document.createElement('canvas');
    out.width = OUT;
    out.height = OUT;
    const o = out.getContext('2d');
    if (!o) return;
    o.imageSmoothingQuality = 'high';
    o.drawImage(image, ((FRAME - w) / 2 + at.x) * k, ((FRAME - h) / 2 + at.y) * k, w * k, h * k);
    let url = out.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/jpeg', 0.85);
    void onSave(url);
  };

  return (
    <Dialog
      open={image !== null}
      onClose={onClose}
      title="Фото для аватарки"
      description="Перетащите фото, чтобы в круг попало нужное, и при желании приблизьте."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={render} disabled={busy}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* двумерное перетаскивание стандартной роли не имеет: application + стрелки и «+ / −» */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- область обрезки управляется мышью, пальцем и клавиатурой */}
        <div
          role="application"
          aria-label="Положение фото: перетащите или двигайте стрелками"
          aria-roledescription="область обрезки"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- стрелки двигают фото
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 24 : 8;
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [step, 0],
              ArrowRight: [-step, 0],
              ArrowUp: [0, step],
              ArrowDown: [0, -step],
            };
            const d = keys[e.key];
            if (d) {
              e.preventDefault();
              move(d[0], d[1]);
            } else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.1));
            else if (e.key === '-') setZoom((z) => Math.max(1, z - 0.1));
          }}
          style={{ width: FRAME, height: FRAME }}
          className="relative cursor-grab touch-none overflow-hidden rounded-card bg-sunken select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:cursor-grabbing"
        >
          {image && (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: w,
                height: h,
                maxWidth: 'none',
                left: (FRAME - w) / 2 + at.x,
                top: (FRAME - h) / 2 + at.y,
              }}
              className="pointer-events-none absolute"
            />
          )}
          {/* всё вне круга притемнено — так видно, что попадёт в аватарку */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-surface"
            style={{ boxShadow: '0 0 0 999px color-mix(in oklab, var(--bg) 70%, transparent)' }}
          />
        </div>
        <div className="flex w-full max-w-[240px] items-center gap-2">
          <IconButton
            label="Отдалить"
            size="sm"
            icon={<Minus size={16} />}
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
          />
          <label htmlFor={zoomId} className="sr-only">
            Приближение
          </label>
          <input
            id={zoomId}
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--primary)]"
          />
          <IconButton
            label="Приблизить"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          />
        </div>
      </div>
    </Dialog>
  );
}
