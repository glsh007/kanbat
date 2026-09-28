import type { LlmCheck } from '@app/shared';
import { Gauge, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { fieldClass } from '@/components/ui/Field';
import { useBoard } from '@/features/board/store';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLlmStatus } from './llmStatus';

const sec = (ms: number) =>
  `${Math.max(0.1, ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;

/** Понятный человеку итог проверки скорости. */
function describe(r: LlmCheck): { text: string; advice: string | null } {
  if (!r.ok) return { text: r.error ?? 'Модель не ответила.', advice: restartAdvice };
  const first = r.firstMs ?? r.totalMs ?? 0;
  const where =
    r.processor?.where === 'gpu'
      ? 'Работает на видеокарте.'
      : r.processor?.where === 'mixed'
        ? `Частично на видеокарте (${Math.round(r.processor.gpuShare * 100)} %), остальное — на процессоре.`
        : r.processor?.where === 'cpu'
          ? 'Работает только на процессоре — поэтому медленно.'
          : '';
  const busy = r.busy > 0 ? ` Одновременно выполнялось запросов: ${r.busy}.` : '';
  const text = `${r.model}: первое слово через ${sec(first)}, ответ целиком — ${sec(r.totalMs ?? first)}. ${where}${busy}`;
  const slow = first > 15_000 || r.processor?.where === 'cpu';
  return {
    text,
    advice: slow
      ? r.processor?.where === 'cpu' || r.processor?.where === 'mixed'
        ? 'Модели не хватает памяти видеокарты. Выберите модель поменьше (например, qwen2.5:3b) или закройте тяжёлые программы.'
        : 'Медленно. Если так и дальше — перезапустите Ollama или выберите модель поменьше.'
      : null,
  };
}

const restartAdvice =
  'Перезапустите Ollama: правый клик по значку ламы у часов → Quit Ollama, затем снова откройте Ollama из меню «Пуск».';

/** Блок «ИИ» в настройках: подключение, выбор модели, проверка скорости, автопринятие лёгких задач. */
export function AiSettings() {
  const { status, offline, loading, refresh } = useLlmStatus();
  const settings = useBoard((s) => s.settings);
  const setSettings = useBoard((s) => s.setSettings);
  const selectId = useId();
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<LlmCheck | null>(null);

  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await api.check(settings.model));
    } catch (e) {
      setCheck({ ok: false, model: null, busy: 0, error: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };
  const result = check ? describe(check) : null;

  const ok = status?.provider === 'ollama' || status?.provider === 'openai';
  const current =
    settings.model && status?.models.includes(settings.model) ? settings.model : status?.model;
  const label = offline
    ? 'Сервер не запущен'
    : !status
      ? 'Проверяю…'
      : ok
        ? status.provider === 'openai'
          ? 'Облачный ИИ подключён'
          : 'Ollama подключена'
        : status.demo
          ? 'Демо-режим'
          : 'недоступен';

  return (
    <section aria-labelledby={`${selectId}-h`} className="flex flex-col gap-2 px-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            ok ? 'bg-accent' : 'border border-line-strong',
          )}
        />
        <h2 id={`${selectId}-h`} className="flex-1 text-sm font-medium text-fg">
          ИИ: {label}
        </h2>
        <IconButton
          label="Проверить подключение"
          icon={<RefreshCw size={15} className={cn(loading && 'animate-spin')} />}
          size="sm"
          onClick={() => void refresh(true)}
          className="-my-1 -mr-2"
        />
      </div>

      {!ok && status?.hint && <p className="text-xs text-fg-muted">{status.hint}</p>}
      {offline && <p className="text-xs text-fg-muted">Запустите в папке проекта: npm run dev</p>}

      {ok && status && status.models.length > 0 && (
        <>
          <label htmlFor={selectId} className="sr-only">
            Модель
          </label>
          <select
            id={selectId}
            value={current ?? ''}
            onChange={(e) => setSettings({ model: e.target.value })}
            className={cn(fieldClass, 'h-9 text-sm')}
          >
            {status.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </>
      )}

      {ok && (
        <div className="flex flex-col gap-1.5">
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Gauge size={16} className={cn(checking && 'animate-pulse')} />}
              disabled={checking}
              onClick={() => void runCheck()}
            >
              {checking ? 'Проверяю… (до 2 минут)' : 'Проверить скорость ИИ'}
            </Button>
          </div>
          <div aria-live="polite" className="flex flex-col gap-1">
            {result && <p className="text-xs text-fg">{result.text}</p>}
            {result?.advice && <p className="text-xs text-fg-muted">{result.advice}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
