/**
 * npm run share — открыть Канбат другим людям по ссылке, пока работает этот компьютер.
 *
 * 1. Собирает сайт и сервер (npm run build).
 * 2. Запускает Канбат на http://localhost:PORT (сайт и API на одном порту).
 * 3. Открывает бесплатный туннель Cloudflare (без регистрации) и печатает публичную ссылку.
 *
 * Программа cloudflared скачивается один раз в папку .tools/. Остановить — Ctrl+C.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3000);
const skipBuild = process.argv.includes('--no-build');
const isWin = process.platform === 'win32';

const say = (s = '') => console.log(s);
const fail = (s) => {
  console.error(`\n✖ ${s}\n`);
  process.exit(1);
};

// ——— 1. Сборка ———
if (!skipBuild) {
  say('▶ Собираю Канбат (около минуты)…');
  // одной строкой через оболочку — так npm находится и на Windows, без предупреждений Node
  const r = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail('Сборка не удалась — посмотрите ошибки выше.');
}
if (
  !existsSync(join(root, 'apps/web/dist/index.html')) ||
  !existsSync(join(root, 'apps/api/dist/main.js'))
)
  fail('Нет собранных файлов. Запустите без --no-build.');

// ——— 2. cloudflared ———
function assetName() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : 'amd64';
  if (isWin) return `cloudflared-windows-${arch === 'arm64' ? 'amd64' : arch}.exe`;
  if (process.platform === 'darwin')
    return `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`;
  return `cloudflared-linux-${arch}`;
}

async function cloudflaredPath() {
  const onPath = spawnSync(isWin ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim().split(/\r?\n/)[0];

  const dir = join(root, '.tools');
  const bin = join(dir, isWin ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(bin)) return bin;

  mkdirSync(dir, { recursive: true });
  const asset = assetName();
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  say(`▶ Скачиваю cloudflared (один раз, ~40 МБ)…`);
  const res = await fetch(url).catch(() => null);
  if (!res?.ok || !res.body)
    fail(
      `Не удалось скачать cloudflared (${res?.status ?? 'нет сети'}). Скачайте вручную: ${url}\n  и положите в папку .tools рядом с проектом.`,
    );
  const tmp = join(dir, `${asset}.part`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  if (asset.endsWith('.tgz')) {
    const t = spawnSync('tar', ['-xzf', tmp, '-C', dir], { stdio: 'inherit' });
    if (t.status !== 0) fail('Не удалось распаковать cloudflared.');
  } else {
    renameSync(tmp, bin);
  }
  if (!isWin) chmodSync(bin, 0o755);
  return bin;
}

// ——— 3. Сервер ———
say('▶ Запускаю Канбат…');
let supportCode = null;
const server = spawn(process.execPath, [join(root, 'scripts/start.mjs')], {
  cwd: join(root, 'apps/api'),
  env: { ...process.env, SERVE_WEB: '1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
server.stdout.on('data', (buf) => {
  const text = buf.toString();
  process.stdout.write(text);
  const m = /Код входа для специалистов: (\S+)/.exec(text);
  if (m) supportCode = m[1];
});
server.on('exit', (code) => {
  if (!stopping)
    fail(
      `Сервер Канбата остановился (код ${code}). Возможно, порт ${port} занят — закройте другие окна с Канбатом.`,
    );
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`http://127.0.0.1:${port}/api/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('Сервер не запустился за 30 секунд.');
}

let stopping = false;
let tunnel = null;
const stop = () => {
  stopping = true;
  tunnel?.kill();
  server.kill('SIGINT');
  setTimeout(() => process.exit(0), 800);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const local = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const via = (() => {
  const i = process.argv.indexOf('--via');
  return i >= 0 ? process.argv[i + 1] : 'auto';
})();

/**
 * Туннель Cloudflare. Ссылка печатается только после того, как cloudflared действительно
 * подключился к Cloudflare («Registered tunnel connection»), — иначе по ссылке «Error 1033».
 * По умолчанию протокол http2 (обычный TCP 443): QUIC (UDP) у многих провайдеров режется.
 */
function cloudflareTunnel(bin, protocol) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      bin,
      [
        'tunnel',
        '--no-autoupdate',
        '--protocol',
        protocol,
        '--edge-ip-version',
        '4',
        '--url',
        local,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const lines = [];
    let url = null;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        proc.kill();
        reject(Object.assign(new Error(err), { log: lines.slice(-8) }));
      } else resolve({ url, proc });
    };
    const onLog = (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length > 60) lines.shift();
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line);
        if (m) url = m[0];
        if (/Registered tunnel connection/i.test(line) && url) finish();
      }
    };
    proc.stdout.on('data', onLog);
    proc.stderr.on('data', onLog);
    proc.on('exit', (code) => finish(`cloudflared завершился (код ${code})`));
    const timer = setTimeout(() => finish('Cloudflare не подключился за 45 секунд'), 45000);
  });
}

/**
 * Запасной туннель без установки программ: localhost.run через ssh (есть в Windows 10/11).
 */
function sshTunnel() {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ssh',
      [
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ExitOnForwardFailure=yes',
        '-R',
        `80:127.0.0.1:${port}`,
        'nokey@localhost.run',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const lines = [];
    let done = false;
    const finish = (err, url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        proc.kill();
        reject(Object.assign(new Error(err), { log: lines.slice(-8) }));
      } else resolve({ url, proc });
    };
    const onLog = (buf) => {
      const text = buf.toString();
      for (const line of text.split(/\r?\n/)) if (line.trim()) lines.push(line);
      const m = /https:\/\/[a-z0-9-]+\.(lhr\.life|localhost\.run)/.exec(text);
      if (m) finish(null, m[0]);
    };
    proc.stdout.on('data', onLog);
    proc.stderr.on('data', onLog);
    proc.on('error', () => finish('ssh не найден'));
    proc.on('exit', (code) => finish(`ssh завершился (код ${code})`));
    const timer = setTimeout(() => finish('localhost.run не ответил за 30 секунд'), 30000);
  });
}

/** Убрать цветовые коды терминала из вывода программ. */
// eslint-disable-next-line no-control-regex
const plain = (t) => t.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

const hasCommand = (cmd) =>
  spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;

/**
 * Tuna (tuna.am) — российский сервис туннелей: работает в России без ограничений, которые
 * провайдеры с июня 2025 накладывают на Cloudflare. Нужна установка и вход один раз:
 *   winget install --id yuccastream.tuna   затем   tuna login
 * На бесплатном тарифе сеанс — до 30 минут (потом запустить заново).
 */
function tunaTunnel() {
  return new Promise((resolve, reject) => {
    // на Windows tuna ставится как tuna.exe/скрипт — запускаем одной строкой через оболочку
    const proc = isWin
      ? spawn(`tuna http ${port}`, { stdio: ['ignore', 'pipe', 'pipe'], shell: true })
      : spawn('tuna', ['http', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    let done = false;
    const finish = (err, url) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        proc.kill();
        reject(Object.assign(new Error(err), { log: lines.slice(-8) }));
      } else resolve({ url, proc });
    };
    const onLog = (buf) => {
      const text = plain(buf.toString());
      for (const line of text.split(/\r?\n/)) if (line.trim()) lines.push(line.trim());
      if (/token|login|авториз/i.test(text) && /error|ошибк|required|нужн/i.test(text))
        return finish('нужно войти: выполните один раз  tuna login');
      const m = /https:\/\/[a-z0-9.-]+\.tuna\.am/i.exec(text);
      if (m) finish(null, m[0]);
    };
    proc.stdout.on('data', onLog);
    proc.stderr.on('data', onLog);
    proc.on('error', () => finish('программа tuna не найдена'));
    proc.on('exit', (code) => finish(`tuna завершился (код ${code})`));
    const timer = setTimeout(() => finish('tuna не выдал ссылку за 30 секунд'), 30000);
  });
}

/** Адреса этого компьютера в локальной сети — для тех, кто в том же Wi-Fi. */
function lanUrls() {
  const out = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? [])
      if (
        a.family === 'IPv4' &&
        !a.internal &&
        /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(a.address)
      )
        out.push(`http://${a.address}:${port}`);
  return out.slice(0, 3);
}

/** Проверяем ссылку сами: новые адреса иногда начинают открываться через несколько секунд. */
async function reachable(url) {
  for (let i = 0; i < 12; i++) {
    const ok = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return true;
    await wait(2500);
  }
  return false;
}

function announce(url, provider, checked) {
  const line = '═'.repeat(64);
  say(`\n${line}`);
  say(`  Канбат открыт для всех по ссылке (${provider}):`);
  say(`\n     ${url}\n`);
  if (!checked)
    say(
      '  ⚠ Проверить ссылку отсюда не удалось — откройте её на телефоне через мобильный интернет.',
    );
  say(`  На этом компьютере:   http://localhost:${port}`);
  for (const u of lanUrls()) say(`  В той же Wi-Fi сети:  ${u}`);
  if (supportCode) say(`  Код для специалистов: ${supportCode}`);
  say('  Ссылка работает, пока открыто это окно. Остановить — Ctrl+C.');
  say(`${line}\n`);
}

function watch(proc, name) {
  tunnel = proc;
  proc.on('exit', (code) => {
    if (!stopping)
      fail(
        `Туннель ${name} закрылся (код ${code}). Проверьте интернет и запустите npm run share ещё раз.`,
      );
  });
}

await waitForServer();

const attempts = [];
const tunaReady = hasCommand('tuna');
if (via === 'tuna' || (via === 'auto' && tunaReady)) attempts.push(['Tuna', () => tunaTunnel()]);
if (via === 'auto' || via === 'cloudflare') {
  attempts.push(['Cloudflare', async () => cloudflareTunnel(await cloudflaredPath(), 'http2')]);
  if (via === 'cloudflare')
    attempts.push([
      'Cloudflare (QUIC)',
      async () => cloudflareTunnel(await cloudflaredPath(), 'quic'),
    ]);
}
if (via === 'auto' || via === 'ssh') attempts.push(['localhost.run', () => sshTunnel()]);

for (const [name, open] of attempts) {
  say(`▶ Открываю ссылку через ${name}…`);
  try {
    const { url, proc } = await open();
    say(`▶ ${name} подключился, проверяю, что ссылка открывается…`);
    if (!(await reachable(url))) {
      // адрес выдан, но страница не открывается (так бывает с Cloudflare в России) — дальше
      proc.kill();
      throw new Error(`ссылка ${url} не открывается`);
    }
    watch(proc, name);
    announce(url, name, true);
    await new Promise(() => undefined); // работаем, пока не нажмут Ctrl+C
  } catch (e) {
    say(`✖ ${name}: ${e.message}`);
    for (const l of e.log ?? []) say(`    ${l}`);
  }
}

say('');
say('✖ Не получилось открыть ссылку для интернета.');
if (!tunaReady)
  say(
    [
      '',
      '  Надёжный вариант для России — сервис Tuna (российский, бесплатно — сеансы по 30 минут):',
      '    1) winget install --id yuccastream.tuna',
      '    2) закройте и откройте окно cmd заново',
      '    3) tuna login        (откроется сайт — зарегистрируйтесь и подтвердите вход)',
      '    4) npm run share -- --no-build',
    ].join('\n'),
  );
say('');
say('  Канбат при этом работает — внутри вашей сети его можно открыть так:');
say(`    На этом компьютере:  http://localhost:${port}`);
for (const u of lanUrls())
  say(`    В той же Wi-Fi сети: ${u}   (если Windows спросит про брандмауэр — «Разрешить»)`);
if (supportCode) say(`    Код для специалистов: ${supportCode}`);
say('');
say('  Окно не закрывайте, пока Канбат нужен. Остановить — Ctrl+C.');
await new Promise(() => undefined);
