import { ImagePlus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { BRAND } from '@/brand/brand';
import { Logo } from '@/brand/Logo';
import {
  cleanBrand,
  DEFAULT_DM,
  DEFAULT_FORUM,
  setOrgBrand,
  type OrgBrandView,
} from '@/brand/orgBrand';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { authHeaders } from '@/lib/session';
import { cn } from '@/lib/cn';

const MAX_BYTES = 200 * 1024;

/** Черновик: картинка — ссылка (сохранённая), data URL (новая) или null (нет). */
interface Draft {
  logo: string | null;
  mark: string | null;
  forumName: string;
  dmName: string;
}

async function call(method: 'GET' | 'PUT', body?: unknown): Promise<OrgBrandView> {
  const r = await fetch('/api/brand', {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json().catch(() => null)) as (OrgBrandView & { message?: string }) | null;
  if (!r.ok) throw new Error(data?.message ?? 'Не удалось сохранить оформление');
  // только строки: неожиданный ответ сервера не должен ломать экран
  return cleanBrand(data);
}

/** Файл → data URL (только PNG и SVG до 200 КБ — остальное сервер тоже не примет). */
function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/svg+xml'].includes(file.type))
    return Promise.reject(new Error('Нужен файл PNG или SVG'));
  if (file.size > MAX_BYTES) return Promise.reject(new Error('Файл больше 200 КБ'));
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Не удалось прочитать файл'));
    fr.readAsDataURL(file);
  });
}

/**
 * «Оформление» (ТЗ v4.28): свой логотип (рядом — «Работает на Канбате»), свой значок вместо летучей
 * мыши и свои названия форума и личных вопросов. Пусто — стандартный Канбат.
 */
export function BrandSettings({
  Block,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
}) {
  const [saved, setSaved] = useState<OrgBrandView | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { forum: useId(), dm: useId() };

  const apply = (v: OrgBrandView) => {
    setSaved(v);
    setD({ logo: v.logo, mark: v.mark, forumName: v.forumName, dmName: v.dmName });
    setOrgBrand(v);
  };
  useEffect(() => {
    call('GET')
      .then(apply)
      .catch((e: Error) => setError(e.message));
  }, []);

  const dirty =
    !!d &&
    !!saved &&
    (d.logo !== saved.logo ||
      d.mark !== saved.mark ||
      d.forumName.trim() !== saved.forumName ||
      d.dmName.trim() !== saved.dmName);

  const pick = (key: 'logo' | 'mark') => async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const url = await readImage(file);
      setD((x) => x && { ...x, [key]: url });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      apply(await call('PUT', body));
      setNote(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changes = (): Record<string, unknown> => {
    if (!d || !saved) return {};
    const out: Record<string, unknown> = { forumName: d.forumName, dmName: d.dmName };
    // картинка: новая — data URL, убрана — null, не менялась — не отправляем
    if (d.logo !== saved.logo) out.logo = d.logo;
    if (d.mark !== saved.mark) out.mark = d.mark;
    return out;
  };

  const standard = !!saved && !saved.logo && !saved.mark && !saved.forumName && !saved.dmName;

  return (
    <Block
      title="Оформление"
      hint={`Ваш логотип, значок и названия вместо стандартных. Под логотипом мелко будет «Работает на ${BRAND.name}е». Пусто — стандартный ${BRAND.name}.`}
    >
      {!d ? (
        <p className="text-sm text-fg-muted">{error ?? 'Загрузка…'}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField
              label="Логотип слева вверху"
              hint="PNG или SVG до 200 КБ, лучше горизонтальный. В тёмной теме — на светлой подложке."
              value={d.logo}
              onPick={pick('logo')}
              onClear={() => setD({ ...d, logo: null })}
            />
            <ImageField
              label="Значок вместо летучей мыши"
              hint="Квадратный PNG или SVG до 200 КБ. Пока помощник думает, значок медленно сужается и расширяется."
              value={d.mark}
              onPick={pick('mark')}
              onClear={() => setD({ ...d, mark: null })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.forum} className="text-sm font-medium text-heading">
                Название форума
              </label>
              <input
                id={ids.forum}
                value={d.forumName}
                maxLength={30}
                placeholder={DEFAULT_FORUM}
                onChange={(e) => setD({ ...d, forumName: e.target.value })}
                className={cn(fieldClass, 'h-11')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.dm} className="text-sm font-medium text-heading">
                Название личных вопросов
              </label>
              <input
                id={ids.dm}
                value={d.dmName}
                maxLength={30}
                placeholder={DEFAULT_DM}
                onChange={(e) => setD({ ...d, dmName: e.target.value })}
                className={cn(fieldClass, 'h-11')}
              />
            </div>
          </div>
          <p className="text-xs text-fg-muted">
            Свои названия не склоняются: в тексте будет «на форуме «Помощь»», «в разделе «Вопросы»».
          </p>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-fg-muted">Так будет выглядеть меню</p>
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Предпросмотр оформления">
              <Preview theme="light" d={d} />
              <Preview theme="dark" d={d} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <p className="min-w-0 flex-1 text-sm text-fg-muted" aria-live="polite">
              {error ? (
                <span role="alert" className="font-medium text-heading">
                  {error}
                </span>
              ) : (
                (note ?? (dirty ? 'Есть несохранённые изменения в оформлении' : ''))
              )}
            </p>
            {!standard && (
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={16} />}
                disabled={busy}
                onClick={() =>
                  void save(
                    { logo: null, mark: null, forumName: '', dmName: '' },
                    `Вернули стандартный ${BRAND.name}.`,
                  )
                }
              >
                Вернуть стандартное
              </Button>
            )}
            <Button
              size="sm"
              icon={<Save size={16} />}
              disabled={busy || !dirty}
              onClick={() => void save(changes(), 'Сохранено — оформление уже видят все.')}
            >
              {busy ? 'Сохраняю…' : 'Сохранить оформление'}
            </Button>
          </div>
        </>
      )}
    </Block>
  );
}

function ImageField({
  label,
  hint,
  value,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  value: string | null;
  onPick: (f: File | undefined) => void;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-heading">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <img
            src={value}
            alt=""
            className="h-10 max-w-40 rounded-control border border-line bg-surface object-contain p-1"
          />
        ) : (
          <span className="text-sm text-fg-muted">Стандартный</span>
        )}
        <label
          htmlFor={id}
          className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm text-fg focus-within:outline-2 focus-within:outline-focus hover:bg-sunken"
        >
          <ImagePlus size={16} aria-hidden />
          {value ? 'Заменить' : 'Загрузить'}
          <input
            id={id}
            type="file"
            accept="image/png,image/svg+xml"
            aria-label={`${label}: загрузить файл`}
            className="sr-only"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} onClick={onClear}>
            Убрать
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-muted">{hint}</p>
    </div>
  );
}

/** Предпросмотр шапки меню в светлой и тёмной теме — по черновику, до сохранения. */
function Preview({ theme, d }: { theme: 'light' | 'dark'; d: Draft }) {
  return (
    <div
      data-theme={theme}
      className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3 text-fg"
    >
      <span className="text-[11px] text-fg-muted">
        {theme === 'light' ? 'Светлая тема' : 'Тёмная тема'}
      </span>
      {d.logo ? (
        <span className="inline-flex flex-col items-start gap-0.5">
          <img
            src={d.logo}
            alt=""
            style={{ height: 28, maxWidth: 168 }}
            className="org-plate box-content object-contain object-left"
          />
          <span className="text-[11px] leading-none text-fg-muted">Работает на {BRAND.name}е</span>
        </span>
      ) : (
        <Logo standard variant="full" size={28} decorative />
      )}
      <span className="flex items-center gap-2 text-sm">
        {d.mark ? (
          <img
            src={d.mark}
            alt=""
            width={20}
            height={20}
            className="org-plate-mark org-breathe box-border object-contain"
            style={{ width: 20, height: 20 }}
          />
        ) : (
          <Logo standard variant="mark" size={20} decorative animate="swing" />
        )}
        <span className="text-fg-muted">Помощник думает…</span>
      </span>
      <span className="text-sm">{d.forumName.trim() || DEFAULT_FORUM}</span>
      <span className="text-sm">{d.dmName.trim() || DEFAULT_DM}</span>
    </div>
  );
}
