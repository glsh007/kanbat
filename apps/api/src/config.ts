import { join, resolve } from 'node:path';

/**
 * Все настройки сервера — из переменных окружения (apps/api/.env или окружение Docker/хостинга).
 * В коде нет ничего, привязанного к конкретному компьютеру.
 */
const provider = ((process.env.LLM_PROVIDER ?? 'ollama').trim().toLowerCase() || 'ollama') as
  'ollama' | 'openai' | 'yandex';
const models = (
  process.env.LLM_MODEL ??
  process.env.OLLAMA_MODEL ??
  (provider === 'yandex' ? 'qwen3.6-35b-a3b,qwen3-235b-a22b-fp8' : '')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const firstModel = models[0] ?? '';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  /** Где лежат данные файлового хранилища. */
  dataDir: resolve(process.env.DATA_DIR ?? join(__dirname, '..', 'data')),
  /** file — JSON-файл (по умолчанию); postgres — на следующем этапе (сервер в интернете). */
  storage: (process.env.STORAGE ?? 'file') as 'file',
  /** Код входа для специалистов; если не задан — сервер придумает и покажет при запуске. */
  supportCode: process.env.SUPPORT_CODE?.trim() || null,
  /** Код администратора организации (ТЗ v4.12); нет — сервер придумает и покажет при запуске. */
  adminCode: process.env.ADMIN_CODE?.trim() || null,
  /** Сроки хранения (ТЗ v4.16): вход без активности, переписка решённых заявок специалиста. */
  sessionDays: Math.max(1, Number(process.env.SESSION_DAYS) || 30),
  ticketKeepDays: Math.max(7, Number(process.env.TICKET_KEEP_DAYS) || 90),
  /** Сколько прокси перед сервером (Caddy, туннель): 1 по умолчанию, 0 — сервер смотрит в интернет сам. */
  trustProxy: Math.max(0, Math.floor(Number(process.env.TRUST_PROXY ?? 1) || 0)),
  /** Отдавать собранный сайт с этого же сервера (npm run share, Docker). */
  serveWeb: process.env.SERVE_WEB === '1',
  webDist: resolve(process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist')),
  /**
   * ИИ: ollama (по умолчанию), openai — любой сервис с OpenAI-совместимым API,
   * yandex — Yandex AI Studio (Qwen, YandexGPT; тот же OpenAI-совместимый API + каталог).
   */
  llmProvider: provider,
  ollamaUrl: (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
  llmBaseUrl: (
    process.env.LLM_BASE_URL ??
    (provider === 'yandex' ? 'https://llm.api.cloud.yandex.net/v1' : 'https://api.openai.com/v1')
  ).replace(/\/$/, ''),
  llmApiKey: (process.env.LLM_API_KEY ?? process.env.YANDEX_API_KEY ?? '').trim(),
  /** Каталог Yandex Cloud (folder ID) — для provider=yandex. */
  yandexFolderId: (process.env.YANDEX_FOLDER_ID ?? '').trim(),
  /**
   * Модель по умолчанию: для Ollama — если не выбрана в интерфейсе; для облака — обязательна.
   * Можно несколько через запятую — первая по умолчанию, остальные на выбор в «Настройках».
   * Для yandex — короткое имя из Yandex AI Studio: qwen3.6-35b-a3b, qwen3-235b-a22b-fp8, yandexgpt-5-lite.
   */
  llmModel: firstModel,
  llmModels: models,
  /**
   * Демо-режим без ИИ: заготовленные ответы вместо модели (только для разработки и тестов).
   * По умолчанию выключен — без модели сервер честно отвечает «ИИ сейчас недоступен».
   */
  llmDemo: process.env.LLM_DEMO === '1',
  /**
   * Сколько секунд ждать, пока модель начнёт отвечать (включая загрузку модели в память).
   * Ответ в JSON целиком — в полтора раза дольше. Без ограничений один «залипший» запрос
   * держит модель, и остальные обращения ждут за ним в очереди.
   */
  llmTimeoutSec: Math.max(20, Number(process.env.LLM_TIMEOUT_S ?? 120) || 120),
};

/** Ограничения ответа модели: длина (в токенах) и паузы. */
export const LLM_LIMITS = {
  firstTokenMs: config.llmTimeoutSec * 1000,
  /** Модель замолчала посреди ответа. */
  idleMs: 60_000,
  jsonMs: Math.round(config.llmTimeoutSec * 1.5) * 1000,
  /** JSON-ответы короткие; ограничение не даёт модели бесконечно генерировать пустоту. */
  jsonTokens: 2048,
  answerTokens: 2048,
  executeTokens: 4096,
};
