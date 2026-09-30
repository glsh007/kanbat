import { useOrgChanged } from '@/features/org/orgEvents';
import {
  RULE_ACTION_LABELS,
  type HardRule,
  type OrgRules,
  type RuleAction,
  type RuleLimits,
  type RulesTest,
} from '@app/shared';
import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { rulesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Правило в редакторе: фразы — текстом, по одной в строке. */
interface RuleDraft {
  id: string;
  phrases: string;
  action: RuleAction;
  service: string;
  note: string;
  enabled: boolean;
}

interface Draft {
  rules: RuleDraft[];
  forbidden: string;
}

const ACTIONS: RuleAction[] = ['urgent', 'specialist', 'hard', 'service'];

const ACTION_HINTS: Record<RuleAction, string> = {
  urgent:
    'Обращение получает срочность «Срочно»: помощник уточняет не больше одного вопроса, а у специалиста оно помечено «Срочно».',
  specialist:
    'Помощник не отвечает сам, а сразу предлагает передать обращение специалисту. Без согласия человека не передаёт.',
  hard: 'Обращение помечается как трудная задача — это видно на карточке и в сводке для специалиста.',
  service: 'В разборе обращения будет указан этот сервис — так специалисту проще найти своё.',
};

const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const blank = (): RuleDraft => ({
  id: newId(),
  phrases: '',
  action: 'urgent',
  service: '',
  note: '',
  enabled: true,
});

/** Пример — чтобы было видно формат. */
const EXAMPLE = (): RuleDraft[] => [
  {
    id: newId(),
    phrases: 'не работает касса\nсломался терминал оплаты',
    action: 'specialist',
    service: '',
    note: 'Кассой занимается дежурный техник — он починит быстрее любой инструкции.',
    enabled: true,
  },
  {
    id: newId(),
    phrases: 'утечка воды\nзапах газа\nзапах дыма',
    action: 'urgent',
    service: '',
    note: '',
    enabled: true,
  },
];

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

const toDraft = (r: OrgRules): Draft => ({
  rules: r.rules.map((x) => ({ ...x, phrases: x.phrases.join('\n') })),
  forbidden: r.forbidden.join('\n'),
});

const toRules = (d: Draft): Pick<OrgRules, 'rules' | 'forbidden'> => ({
  rules: d.rules.map((r): HardRule => ({
    id: r.id,
    phrases: lines(r.phrases),
    action: r.action,
    service: r.action === 'service' ? r.service.trim() : '',
    note: r.action === 'specialist' ? r.note.trim() : '',
    enabled: r.enabled,
  })),
  forbidden: lines(d.forbidden),
});

const key = (d: Draft | null) => (d ? JSON.stringify(toRules(d)) : '');

/**
 * «Жёсткие правила» (ТЗ v4.26, п. 17, шаг 2): их выполняет сервер, и они сильнее мнения ИИ.
 * Правила разбора: фразы в обращении → срочно / сразу к специалисту / трудная задача / сервис.
 * Запрещено в ответах: предложение с такой фразой убирается из ответа ИИ до того, как его увидит человек.
 */
export function HardRules({
  Block,
  onDirtyChange,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
  /** Есть несохранённые правила — чтобы общая панель внизу страницы подсказала про их кнопку. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<OrgRules | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [limits, setLimits] = useState<RuleLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forbiddenId = useId();

  useEffect(() => {
    let alive = true;
    rulesApi
      .get()
      .then(({ limits: l, ...r }) => {
        if (!alive) return;
        setSaved(r);
        setDraft(toDraft(r));
        setLimits(l);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = useMemo(
    () => !!draft && !!saved && key(draft) !== key(toDraft(saved)),
    [draft, saved],
  );
  // «Разбор ошибок» добавил правило — перечитываем, если здесь нет несохранённых правок
  const reload = useCallback(() => {
    if (dirty) return;
    void rulesApi.get().then(({ limits: l, ...r }) => {
      setSaved(r);
      setDraft(toDraft(r));
      setLimits(l);
    });
  }, [dirty]);
  useOrgChanged(reload);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const setRule = (id: string, p: Partial<RuleDraft>) => {
    setNote(null);
    setDraft((d) => d && { ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  };
  const addRules = (list: RuleDraft[]) => {
    setNote(null);
    setDraft((d) => d && { ...d, rules: [...d.rules, ...list] });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await rulesApi.save(toRules(draft));
      setSaved(r);
      setDraft(toDraft(r));
      setNote('Сохранено — правила уже действуют для новых обращений.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block
      title="Жёсткие правила"
      hint="Их выполняет сервер — они сильнее мнения ИИ. Действуют только на помощника: специалисты пишут как обычно."
    >
      {!draft ? (
        <p className="text-sm text-fg-muted">{error ?? 'Загрузка…'}</p>
      ) : (
        <>
          <TestBox draft={draft} />

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-heading">Правила разбора</h3>
            <p className="text-xs text-fg-muted">
              Если в обращении есть фраза из правила (слова — в любой форме), помощник делает то,
              что сказано, даже если сам решил бы иначе. «Не» учитывается: «не работает касса» не
              сработает на «касса работает».
            </p>
            {draft.rules.length === 0 ? (
              <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong p-4">
                <p className="text-sm text-fg-muted">Правил пока нет — помощник решает сам.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<Plus size={16} />} onClick={() => addRules([blank()])}>
                    Добавить правило
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => addRules(EXAMPLE())}>
                    Добавить пример
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ol className="flex flex-col gap-2" aria-label="Правила разбора">
                  {draft.rules.map((r, i) => (
                    <RuleCard
                      key={r.id}
                      n={i + 1}
                      rule={r}
                      limits={limits}
                      onChange={(p) => setRule(r.id, p)}
                      onRemove={() => {
                        setNote(null);
                        setDraft((d) => d && { ...d, rules: d.rules.filter((x) => x.id !== r.id) });
                      }}
                    />
                  ))}
                </ol>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={16} />}
                    disabled={draft.rules.length >= (limits?.rules ?? 50)}
                    onClick={() => addRules([blank()])}
                  >
                    Добавить правило
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-heading">
              <label htmlFor={forbiddenId}>Запрещено в ответах</label>
            </h3>
            <textarea
              id={forbiddenId}
              rows={3}
              value={draft.forbidden}
              aria-describedby={`${forbiddenId}-hint`}
              onChange={(e) => {
                setNote(null);
                setDraft((d) => d && { ...d, forbidden: e.target.value });
              }}
              placeholder={'гарантируем\nбесплатно'}
              className={cn(fieldClass, 'resize-y py-2 leading-snug')}
            />
            <p id={`${forbiddenId}-hint`} className="text-xs text-fg-muted">
              Каждая фраза — с новой строки, до {limits?.forbidden ?? 50}. Предложение с такой
              фразой помощник не покажет: его уберут до того, как человек увидит ответ. В отличие от
              «Никогда» в тонкостях, это не просьба к ИИ, а фильтр.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <p className="min-w-0 flex-1 text-sm text-fg-muted" aria-live="polite">
              {error ? (
                <span role="alert" className="font-medium text-heading">
                  {error}
                </span>
              ) : (
                (note ?? (dirty ? 'Есть несохранённые изменения в правилах' : ''))
              )}
            </p>
            <Button
              size="sm"
              icon={<Save size={16} />}
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? 'Сохраняю…' : 'Сохранить правила'}
            </Button>
          </div>
        </>
      )}
    </Block>
  );
}

function RuleCard({
  n,
  rule,
  limits,
  onChange,
  onRemove,
}: {
  n: number;
  rule: RuleDraft;
  limits: RuleLimits | null;
  onChange: (p: Partial<RuleDraft>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const title = `Правило ${n}`;
  return (
    <li
      className={cn(
        'flex flex-col gap-2.5 rounded-card border p-3',
        rule.enabled ? 'border-line' : 'border-dashed border-line-strong',
      )}
    >
      <fieldset className="contents">
        <legend className="sr-only">{title}</legend>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-medium text-heading" aria-hidden>
            {title}
            {!rule.enabled && <span className="font-normal text-fg-muted"> · выключено</span>}
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="size-4 accent-primary"
            />
            Включено
          </label>
          <IconButton
            size="sm"
            label={`Удалить: ${title}`}
            icon={<Trash2 size={16} />}
            onClick={onRemove}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-ph`} className="text-sm text-heading">
            Фразы в обращении
          </label>
          <textarea
            id={`${id}-ph`}
            rows={Math.min(6, Math.max(2, rule.phrases.split('\n').length))}
            value={rule.phrases}
            onChange={(e) => onChange({ phrases: e.target.value })}
            placeholder={'не работает касса\nсломался терминал'}
            aria-describedby={`${id}-ph-hint`}
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
          <p id={`${id}-ph-hint`} className="text-xs text-fg-muted">
            Каждая — с новой строки, до {limits?.phrases ?? 20}. Срабатывает, если в обращении есть
            все слова фразы.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-act`} className="text-sm text-heading">
            Что сделать
          </label>
          <select
            id={`${id}-act`}
            value={rule.action}
            onChange={(e) => onChange({ action: e.target.value as RuleAction })}
            aria-describedby={`${id}-act-hint`}
            className={cn(fieldClass, 'h-11')}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {RULE_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          <p id={`${id}-act-hint`} className="text-xs text-fg-muted">
            {ACTION_HINTS[rule.action]}
          </p>
        </div>
        {rule.action === 'service' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-svc`} className="text-sm text-heading">
              Сервис
            </label>
            <input
              id={`${id}-svc`}
              value={rule.service}
              maxLength={limits?.service}
              onChange={(e) => onChange({ service: e.target.value })}
              placeholder="Например: Кассы и оплата"
              className={cn(fieldClass, 'h-11')}
            />
          </div>
        )}
        {rule.action === 'specialist' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-note`} className="text-sm text-heading">
              Что сказать человеку (необязательно)
            </label>
            <textarea
              id={`${id}-note`}
              rows={2}
              value={rule.note}
              maxLength={limits?.note}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="Кассой занимается дежурный техник — он починит быстрее любой инструкции."
              aria-describedby={`${id}-note-hint`}
              className={cn(fieldClass, 'resize-y py-2 leading-snug')}
            />
            <p id={`${id}-note-hint`} className="text-xs text-fg-muted">
              Помощник скажет это и спросит: «Передать обращение специалисту?»
            </p>
          </div>
        )}
      </fieldset>
    </li>
  );
}

/** «Проверить на фразе» — мгновенно, без ИИ, по правилам в редакторе (даже не сохранённым). */
function TestBox({ draft }: { draft: Draft }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RulesTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const empty = draft.rules.length === 0 && !draft.forbidden.trim();

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await rulesApi.test(text.trim(), toRules(draft)));
    } catch (e) {
      setRes(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-card bg-sunken p-3">
      <label htmlFor={id} className="text-sm font-medium text-heading">
        Проверить на фразе
      </label>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: с утра не работает касса"
          disabled={empty}
          className={cn(fieldClass, 'h-10 min-w-0 flex-1 bg-surface')}
        />
        <Button
          type="submit"
          size="sm"
          icon={<Search size={16} />}
          disabled={empty || busy || !text.trim()}
        >
          {busy ? 'Проверяю…' : 'Проверить'}
        </Button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {empty && (
          <p className="text-fg-muted">Добавьте правило или запрещённую фразу, чтобы проверять.</p>
        )}
        {error && <p className="font-medium text-heading">{error}</p>}
        {res && (
          <>
            <p>
              <span className="text-fg-muted">Как обращение: </span>
              {res.fired.length ? (
                <span className="font-medium text-heading">
                  сработает{' '}
                  {res.fired
                    .map((f) => {
                      const extra = f.action === 'service' && f.service ? ` «${f.service}»` : '';
                      return `«${RULE_ACTION_LABELS[f.action]}»${extra} — по фразе «${f.phrase}»`;
                    })
                    .join('; ')}
                  .
                </span>
              ) : (
                <span className="font-medium text-heading">ни одно правило не сработает.</span>
              )}
            </p>
            <p>
              <span className="text-fg-muted">Как ответ помощника: </span>
              {res.censored ? (
                res.cleaned.trim() ? (
                  <>
                    <span className="font-medium text-heading">
                      запрещённое уберу, человек увидит:
                    </span>{' '}
                    «{res.cleaned.trim()}»
                  </>
                ) : (
                  <span className="font-medium text-heading">
                    запрещённое уберу — от текста ничего не останется.
                  </span>
                )
              ) : (
                <span className="font-medium text-heading">покажу как есть.</span>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
