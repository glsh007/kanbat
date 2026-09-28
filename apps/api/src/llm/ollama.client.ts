import { LLM_LIMITS } from '../config';
import type { ChatMessage } from './types';
import { requestSignal, Watchdog } from './watchdog';

export type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ChatBody = {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  format?: unknown;
  think?: boolean;
  keep_alive?: string;
  options?: Record<string, number>;
};

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Минимальный клиент HTTP API Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md).
 * Без зависимостей: встроенный fetch Node 20+.
 */
export class OllamaClient {
  /** Модели без поддержки параметра think отвечают ошибкой — запоминаем и больше его не шлём. */
  private readonly noThink = new Set<string>();

  constructor(readonly baseUrl: string) {}

  async version(signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/version`, { signal });
    if (!res.ok) throw new OllamaError(`Ollama ответила ${res.status}`, res.status);
    const data = (await res.json()) as { version?: string };
    return data.version ?? 'unknown';
  }

  async models(signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`, { signal });
    if (!res.ok) throw new OllamaError(`Ollama ответила ${res.status}`, res.status);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  }

  private async post(body: ChatBody, signal?: AbortSignal): Promise<Response> {
    const send = (b: ChatBody) =>
      fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
        signal,
      });

    body = softNoThink(body);
    const withThink = this.noThink.has(body.model) ? body : { ...body, think: false };
    let res = await send(withThink);
    if (res.status === 400 && withThink.think !== undefined) {
      const text = await res.text();
      if (/think/i.test(text)) {
        this.noThink.add(body.model);
        res = await send(body);
      } else {
        throw new OllamaError(parseError(text), 400);
      }
    }
    if (!res.ok) throw new OllamaError(parseError(await res.text()), res.status);
    return res;
  }

  /**
   * Ответ строго по JSON-схеме (structured outputs).
   * Ограничены длина (маленькие модели иногда бесконечно генерируют пробелы) и время.
   */
  async json<T>(
    model: string,
    messages: OllamaMessage[],
    schema: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const wd = new Watchdog(signal, requestSignal());
    wd.arm(
      LLM_LIMITS.jsonMs,
      `Модель не ответила за ${Math.round(LLM_LIMITS.jsonMs / 1000)} с — возможно, она перегружена или ещё загружается. Попробуйте ещё раз или выберите модель полегче в «Настройках».`,
    );
    let data: { message?: { content?: string } };
    try {
      const res = await this.post(
        {
          model,
          messages,
          stream: false,
          format: schema,
          keep_alive: '30m',
          options: { temperature: 0.2, num_ctx: 8192, num_predict: LLM_LIMITS.jsonTokens },
        },
        wd.signal,
      );
      data = (await res.json()) as { message?: { content?: string } };
    } catch (e) {
      throw wd.error(e);
    } finally {
      wd.dispose();
    }
    const content = stripThink(data.message?.content ?? '');
    try {
      return JSON.parse(content) as T;
    } catch {
      // маленькие модели иногда оборачивают JSON в текст — достаём первый объект
      const m = content.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]) as T;
      throw new OllamaError('Модель вернула не JSON');
    }
  }

  /**
   * Потоковый ответ: отдаёт кусочки текста по мере генерации (NDJSON).
   * Модель должна начать отвечать за `firstTokenMs` и не замолкать дольше `idleMs`.
   */
  async *stream(
    model: string,
    messages: OllamaMessage[],
    signal?: AbortSignal,
    maxTokens: number = LLM_LIMITS.answerTokens,
  ): AsyncGenerator<string> {
    const wd = new Watchdog(signal, requestSignal());
    wd.arm(
      LLM_LIMITS.firstTokenMs,
      `Модель не начала отвечать за ${Math.round(LLM_LIMITS.firstTokenMs / 1000)} с — возможно, она ещё загружается или занята другим запросом. Попробуйте ещё раз через минуту.`,
    );
    try {
      const res = await this.post(
        {
          model,
          messages,
          stream: true,
          keep_alive: '30m',
          options: { temperature: 0.6, num_ctx: 8192, num_predict: maxTokens },
        },
        wd.signal,
      );
      if (!res.body) throw new OllamaError('Пустой ответ Ollama');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let armedAt = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const evt = JSON.parse(line) as {
            message?: { content?: string };
            error?: string;
            done?: boolean;
          };
          if (evt.error) throw new OllamaError(evt.error);
          if (evt.message?.content) {
            // отсчёт тишины перезапускаем не чаще раза в секунду — таймеры на каждый токен ни к чему
            if (Date.now() - armedAt > 1000) {
              armedAt = Date.now();
              wd.arm(LLM_LIMITS.idleMs, 'Модель замолчала посреди ответа. Попробуйте ещё раз.');
            }
            yield evt.message.content;
          }
          if (evt.done) return;
        }
      }
    } catch (e) {
      throw wd.error(e);
    } finally {
      wd.dispose();
    }
  }

  /**
   * Где работает загруженная модель (GET /api/ps): на видеокарте, частично или на процессоре.
   * null — модель сейчас не загружена или Ollama не сообщает.
   */
  async processor(
    model: string,
  ): Promise<{ where: 'gpu' | 'cpu' | 'mixed'; gpuShare: number } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        models?: { name?: string; model?: string; size?: number; size_vram?: number }[];
      };
      const m = data.models?.find((x) => x.name === model || x.model === model);
      if (!m?.size) return null;
      const share = Math.max(0, Math.min(1, (m.size_vram ?? 0) / m.size));
      return { where: share >= 0.99 ? 'gpu' : share <= 0.01 ? 'cpu' : 'mixed', gpuShare: share };
    } catch {
      return null;
    }
  }
}

export function toOllama(system: string, history: ChatMessage[]): OllamaMessage[] {
  return [{ role: 'system', content: system }, ...history];
}

function stripThink(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  // рассуждения без открывающего тега: всё до последнего </think> — не ответ
  const end = out.lastIndexOf('</think>');
  return (end >= 0 ? out.slice(end + '</think>'.length) : out).trim();
}

function parseError(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* не JSON */
  }
  return text || 'Ошибка Ollama';
}

/**
 * Qwen3 иногда «думает» вслух даже с think: false (зависит от версии Ollama) — и рассуждения
 * попадают в ответ. Для неё добавляем в системный промпт мягкий переключатель /no_think.
 */
function softNoThink(body: ChatBody): ChatBody {
  if (!/^qwen3/i.test(body.model)) return body;
  const [first, ...rest] = body.messages;
  if (!first || first.role !== 'system' || first.content.includes('/no_think')) return body;
  return { ...body, messages: [{ ...first, content: `${first.content}\n/no_think` }, ...rest] };
}
