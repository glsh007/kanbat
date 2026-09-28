import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Сигнал отмены текущего HTTP-запроса к /api/llm/*: браузер ушёл (новое сообщение, «Стоп»,
 * закрыл вкладку) — перестаём ждать модель и освобождаем её для следующих запросов.
 * Ollama обрабатывает запросы по очереди, поэтому брошенный запрос задерживает всех остальных.
 */
const requestSignals = new AsyncLocalStorage<AbortSignal>();

export const requestSignal = (): AbortSignal | undefined => requestSignals.getStore();

export function runWithRequestSignal<T>(signal: AbortSignal, fn: () => T): T {
  return requestSignals.run(signal, fn);
}

/** Ошибка по таймеру — с понятным человеку текстом. */
export class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Сторож запроса к модели: прерывает его, если внешние сигналы отменены
 * или за отведённое время ничего не произошло (`arm` перезапускает отсчёт).
 */
export class Watchdog {
  private readonly ctrl = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reason: string | null = null;
  private readonly sources: AbortSignal[];
  private readonly onAbort = () => this.ctrl.abort();

  constructor(...signals: (AbortSignal | undefined)[]) {
    this.sources = signals.filter((s): s is AbortSignal => !!s);
    for (const s of this.sources) {
      if (s.aborted) this.ctrl.abort();
      else s.addEventListener('abort', this.onAbort, { once: true });
    }
  }

  get signal(): AbortSignal {
    return this.ctrl.signal;
  }

  /** Если за `ms` ничего не произойдёт — прервать запрос с сообщением `message`. */
  arm(ms: number, message: string) {
    this.clear();
    this.timer = setTimeout(() => {
      this.reason = message;
      this.ctrl.abort();
    }, ms);
  }

  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Прервали по таймеру — понятная ошибка; иначе исходная. */
  error(e: unknown): unknown {
    return this.reason ? new LlmTimeoutError(this.reason) : e;
  }

  dispose() {
    this.clear();
    for (const s of this.sources) s.removeEventListener('abort', this.onAbort);
  }
}
