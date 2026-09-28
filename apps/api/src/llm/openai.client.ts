import { LLM_LIMITS } from '../config';
import { OllamaError, type OllamaMessage } from './ollama.client';
import { requestSignal, Watchdog } from './watchdog';

/** Особенности сервиса: Yandex AI Studio — каталог в заголовке и модели вида gpt://<каталог>/<имя>/latest. */
export type OpenAiOptions = {
  baseUrl: string;
  apiKey: string;
  /** Модели из LLM_MODEL (короткие имена); пусто — спросить список у сервиса. */
  models: string[];
  /** Каталог Yandex Cloud (folder ID). */
  yandexFolderId?: string;
};

/**
 * Клиент любого сервиса с OpenAI-совместимым API (Yandex AI Studio — Qwen и YandexGPT, OpenAI,
 * OpenRouter, vLLM, LM Studio и т. п.). Нужен, когда Канбат работает на сервере в интернете
 * и ИИ не на вашем компьютере. Тот же интерфейс, что у OllamaClient.
 */
export class OpenAiClient {
  /** Модели, которые не понимают response_format json_schema, — сразу просим json_object. */
  private readonly noSchema = new Set<string>();
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fixedModels: string[];
  private readonly folder: string;

  constructor(o: OpenAiOptions) {
    this.baseUrl = o.baseUrl;
    this.apiKey = o.apiKey;
    this.fixedModels = o.models;
    this.folder = o.yandexFolderId ?? '';
  }

  private get yandex() {
    return !!this.folder;
  }

  /**
   * Здоров ли сервис: время последнего удачного ответа. Удачные запросы продлевают его сами,
   * сбой (нет связи, 5xx, ключ, деньги) — сбрасывает, и следующая проверка статуса
   * делает короткий запрос. Так «ИИ недоступен» видно честно, а лишних платных запросов нет.
   */
  private okAt = 0;
  private static readonly HEALTH_TTL_MS = 3 * 60_000;

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      // Yandex AI Studio: в каком каталоге работать (OpenAI-совместимый API и родной заголовок)
      ...(this.folder ? { 'OpenAI-Project': this.folder, 'x-folder-id': this.folder } : {}),
    };
  }

  /** Короткое имя → адрес модели у сервиса: «qwen3.6-35b-a3b» → gpt://<каталог>/qwen3.6-35b-a3b/latest. */
  uri(model: string): string {
    if (!this.yandex || /^(gpt|emb):\/\//.test(model)) return model;
    return `gpt://${this.folder}/${model}${model.includes('/') ? '' : '/latest'}`;
  }

  /**
   * Qwen3 умеет «думать вслух» (<think>): в JSON это лишнее время и риск обрыва.
   * Мягкий переключатель /no_think — как для qwen3 в Ollama; остальные модели его не замечают.
   */
  private prepare(model: string, messages: OllamaMessage[]): OllamaMessage[] {
    if (!/qwen3/i.test(model)) return messages;
    const [first, ...rest] = messages;
    if (!first || first.role !== 'system' || first.content.includes('/no_think')) return messages;
    return [{ ...first, content: `${first.content}\n/no_think` }, ...rest];
  }

  async version(): Promise<string> {
    return 'OpenAI-совместимый API';
  }

  /** Если модели заданы в LLM_MODEL — только они (списки у облачных сервисов огромные). */
  async models(signal?: AbortSignal): Promise<string[]> {
    if (this.yandex) {
      // у Yandex AI Studio нет общего списка моделей: доступность проверяем коротким запросом
      if (!this.apiKey) throw new OllamaError('Не задан ключ LLM_API_KEY', 401);
      if (!this.fixedModels.length) throw new OllamaError('Не задана модель LLM_MODEL');
      if (Date.now() - this.okAt > OpenAiClient.HEALTH_TTL_MS)
        await this.post(
          {
            model: this.fixedModels[0],
            max_tokens: 1,
            temperature: 0,
            messages: [{ role: 'user', content: 'ok' }],
          },
          signal,
        );
      return this.fixedModels;
    }
    if (this.fixedModels.length) {
      // проверяем, что сервис доступен и ключ подходит
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal });
      if (res.status === 401 || res.status === 403)
        throw new OllamaError('Сервис ИИ не принял ключ LLM_API_KEY', res.status);
      return this.fixedModels;
    }
    const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal });
    if (!res.ok) throw new OllamaError(`Сервис ИИ ответил ${res.status}`, res.status);
    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id).slice(0, 50);
  }

  private async post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const model = String(body.model ?? '');
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          ...body,
          model: this.uri(model),
          messages: this.prepare(model, body.messages as OllamaMessage[]),
        }),
        signal,
      });
    } catch (e) {
      // нет связи с сервисом (но не «пользователь отменил»)
      if (!signal?.aborted) this.okAt = 0;
      throw e;
    }
    // 429 — «подождите», 400 — наш запрос (например, json_schema); остальное — сервис нездоров
    if (res.ok) this.okAt = Date.now();
    else if (res.status !== 429 && res.status !== 400) this.okAt = 0;
    if (!res.ok) {
      const text = await res.text();
      let message = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string };
        message = typeof j.error === 'string' ? j.error : (j.error?.message ?? message);
      } catch {
        /* не JSON */
      }
      throw new OllamaError(explain(res.status, message), res.status);
    }
    return res;
  }

  /** Ответ по JSON-схеме; если сервис не умеет json_schema — просим просто JSON и даём схему текстом. */
  async json<T>(
    model: string,
    messages: OllamaMessage[],
    schema: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const wd = new Watchdog(signal, requestSignal());
    wd.arm(
      LLM_LIMITS.jsonMs,
      `Сервис ИИ не ответил за ${Math.round(LLM_LIMITS.jsonMs / 1000)} с. Попробуйте ещё раз.`,
    );
    try {
      return await this.jsonOnce<T>(model, messages, schema, wd.signal);
    } catch (e) {
      throw wd.error(e);
    } finally {
      wd.dispose();
    }
  }

  private async jsonOnce<T>(
    model: string,
    messages: OllamaMessage[],
    schema: object,
    signal: AbortSignal,
  ): Promise<T> {
    let res: Response | null = null;
    if (!this.noSchema.has(model))
      try {
        res = await this.post(
          {
            model,
            messages,
            temperature: 0.2,
            max_tokens: LLM_LIMITS.jsonTokens,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'result', schema, strict: false },
            },
          },
          signal,
        );
      } catch (e) {
        if (!(e instanceof OllamaError) || e.status !== 400) throw e;
        this.noSchema.add(model);
      }
    if (!res) {
      const [sys, ...rest] = messages;
      res = await this.post(
        {
          model,
          temperature: 0.2,
          max_tokens: LLM_LIMITS.jsonTokens,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${sys?.content ?? ''}\nJSON-схема ответа: ${JSON.stringify(schema)}`,
            },
            ...rest,
          ],
        },
        signal,
      );
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = (data.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    try {
      return JSON.parse(content) as T;
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]) as T;
      throw new OllamaError('Модель вернула не JSON');
    }
  }

  /** Потоковый ответ (SSE: data: {...}, в конце data: [DONE]). Сроки — как у Ollama. */
  async *stream(
    model: string,
    messages: OllamaMessage[],
    signal?: AbortSignal,
    maxTokens: number = LLM_LIMITS.answerTokens,
  ): AsyncGenerator<string> {
    const wd = new Watchdog(signal, requestSignal());
    wd.arm(
      LLM_LIMITS.firstTokenMs,
      `Сервис ИИ не начал отвечать за ${Math.round(LLM_LIMITS.firstTokenMs / 1000)} с. Попробуйте ещё раз.`,
    );
    try {
      yield* this.streamOnce(model, messages, wd, maxTokens);
    } catch (e) {
      throw wd.error(e);
    } finally {
      wd.dispose();
    }
  }

  private async *streamOnce(
    model: string,
    messages: OllamaMessage[],
    wd: Watchdog,
    maxTokens: number,
  ): AsyncGenerator<string> {
    const res = await this.post(
      { model, messages, stream: true, temperature: 0.6, max_tokens: maxTokens },
      wd.signal,
    );
    if (!res.body) throw new OllamaError('Пустой ответ сервиса ИИ');
    let armedAt = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        const evt = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          error?: { message?: string };
        };
        if (evt.error) throw new OllamaError(evt.error.message ?? 'Ошибка сервиса ИИ');
        const t = evt.choices?.[0]?.delta?.content;
        if (t) {
          if (Date.now() - armedAt > 1000) {
            armedAt = Date.now();
            wd.arm(LLM_LIMITS.idleMs, 'Сервис ИИ замолчал посреди ответа. Попробуйте ещё раз.');
          }
          yield t;
        }
      }
    }
  }

  /** У облачного сервиса видеокарты не видно. */
  async processor(): Promise<null> {
    return null;
  }
}

/** Понятный текст ошибки облачного ИИ: что не так и что проверить. */
export function explain(status: number, message: string): string {
  const m = message || `код ${status}`;
  if (status === 401) return `Сервис ИИ не принял ключ (LLM_API_KEY): ${m}`;
  if (status === 403)
    return `Нет доступа к модели: проверьте каталог (YANDEX_FOLDER_ID) и роль ключа. ${m}`;
  if (status === 404) return `Модель не найдена — проверьте LLM_MODEL: ${m}`;
  if (status === 429) return `Сервис ИИ просит подождать (лимит запросов): ${m}`;
  if (status === 402) return `Сервис ИИ: закончились деньги на балансе. ${m}`;
  return `Сервис ИИ ответил ${status}: ${m}`;
}
