#!/usr/bin/env node
/**
 * Проверка облачного ИИ одной командой (на сервере: docker compose exec kanbat node scripts/check-ai.mjs).
 * Делает один короткий запрос с теми же настройками, что и Канбат, и объясняет, что не так.
 * Ключ на экран не выводится.
 */
const env = process.env;
const provider = (env.LLM_PROVIDER ?? 'ollama').trim().toLowerCase();
const ok = (t) => console.log(`✓ ${t}`);
const bad = (t) => {
  console.log(`✗ ${t}`);
  process.exitCode = 1;
};

if (provider === 'ollama') {
  const url = (env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    ok(`Ollama отвечает (${url}), моделей: ${d.models?.length ?? 0}`);
  } catch (e) {
    bad(`Ollama не отвечает по адресу ${url}: ${e.message}`);
  }
  process.exit();
}

const folder = (env.YANDEX_FOLDER_ID ?? '').trim();
const key = (env.LLM_API_KEY ?? env.YANDEX_API_KEY ?? '').trim();
const base = (
  env.LLM_BASE_URL ??
  (provider === 'yandex' ? 'https://llm.api.cloud.yandex.net/v1' : 'https://api.openai.com/v1')
).replace(/\/$/, '');
const models = (env.LLM_MODEL ?? (provider === 'yandex' ? 'qwen3.6-35b-a3b' : ''))
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

console.log(`ИИ: ${provider === 'yandex' ? 'Yandex AI Studio' : base}`);
if (!key) bad('Не задан ключ: LLM_API_KEY в файле .env');
if (provider === 'yandex' && !folder) bad('Не задан каталог: YANDEX_FOLDER_ID в файле .env');
if (!models.length) bad('Не задана модель: LLM_MODEL в файле .env');
if (process.exitCode) process.exit();
ok(`ключ задан (…${key.slice(-4)})${folder ? `, каталог ${folder}` : ''}`);

const uri = (m) =>
  provider === 'yandex' && !/^gpt:\/\//.test(m)
    ? `gpt://${folder}/${m}${m.includes('/') ? '' : '/latest'}`
    : m;

for (const model of models) {
  const started = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(folder ? { 'OpenAI-Project': folder, 'x-folder-id': folder } : {}),
      },
      body: JSON.stringify({
        model: uri(model),
        temperature: 0,
        max_tokens: 60,
        messages: [
          { role: 'system', content: 'Ответь одним словом по-русски. /no_think' },
          { role: 'user', content: 'Какого цвета небо днём?' },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    const s = ((Date.now() - started) / 1000).toFixed(1);
    if (!r.ok) {
      const hint =
        r.status === 401
          ? 'ключ не подошёл — создайте новый API-ключ и вставьте его в LLM_API_KEY'
          : r.status === 403
            ? 'нет доступа — проверьте YANDEX_FOLDER_ID (каталог, где создан ключ) и что ключ создан кнопкой «Создать API-ключ» в AI Studio этого каталога (роль ai.editor или ai.languageModels.user)'
            : r.status === 404
              ? 'модель не найдена — проверьте имя в LLM_MODEL'
              : r.status === 402
                ? 'закончились деньги на балансе / не привязан платёжный аккаунт'
                : r.status === 429
                  ? 'слишком много запросов — подождите минуту'
                  : 'см. текст ошибки';
      bad(`${model}: ошибка ${r.status} за ${s} с — ${hint}\n  ${text.slice(0, 300)}`);
      continue;
    }
    const d = JSON.parse(text);
    const answer = (d.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    ok(`${model}: ответила за ${s} с — «${answer.slice(0, 40)}»`);
  } catch (e) {
    bad(`${model}: сервис не ответил — ${e.message} (есть ли у сервера выход в интернет?)`);
  }
}
if (!process.exitCode) console.log('\nВсё в порядке: Канбат может работать с этим ИИ.');
