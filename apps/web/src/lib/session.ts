import type { LoginResult, User, UserRole } from '@app/shared';
import { create } from 'zustand';
import { safeStorage } from './storage';

/**
 * Сессия: токен и пользователь. Хранится в localStorage этого браузера;
 * сами данные (доска, обращения) — на сервере.
 */
const KEY = 'kc-session';

type SessionState = {
  token: string | null;
  user: User | null;
  set: (s: LoginResult | null) => void;
};

function read(): LoginResult | null {
  try {
    const v = JSON.parse(safeStorage.get(KEY) ?? 'null') as LoginResult | null;
    return v?.token && v.user ? v : null;
  } catch {
    return null;
  }
}

const initial = read();

export const useSession = create<SessionState>()((set) => ({
  token: initial?.token ?? null,
  user: initial?.user ?? null,
  set: (s) => {
    if (s) safeStorage.set(KEY, JSON.stringify(s));
    else safeStorage.remove(KEY);
    set({ token: s?.token ?? null, user: s?.user ?? null });
  },
}));

export const sessionToken = () => useSession.getState().token;

export function authHeaders(): Record<string, string> {
  const t = sessionToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Сервер не узнал токен (данные сервера удалили, сессию закрыли) — снова на экран входа. */
export function sessionExpired() {
  if (useSession.getState().token) useSession.getState().set(null);
}

export const useUser = () => useSession((s) => s.user);
export const useUserRole = (): UserRole | null => useSession((s) => s.user?.role ?? null);

export async function login(
  name: string,
  role: UserRole,
  password: string,
  code?: string,
): Promise<User> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, role, code, password }),
  }).catch(() => null);
  if (!res) throw new Error('Сервер не отвечает. Проверьте, что Канбат запущен.');
  const data = (await res.json().catch(() => null)) as (LoginResult & { message?: string }) | null;
  if (!res.ok || !data?.token) throw new Error(data?.message ?? `Ошибка входа (${res.status})`);
  useSession.getState().set({ token: data.token, user: data.user });
  return data.user;
}

export async function logout() {
  const headers = authHeaders();
  useSession.getState().set(null);
  await fetch('/api/auth/logout', { method: 'POST', headers }).catch(() => undefined);
}

/** Есть ли кабинет с таким именем: экран входа просит придумать или ввести пароль. */
export async function checkAccount(
  name: string,
  role: UserRole,
  signal?: AbortSignal,
): Promise<{ exists: boolean; hasPassword: boolean } | null> {
  try {
    const res = await fetch('/api/auth/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
      signal,
    });
    return res.ok ? ((await res.json()) as { exists: boolean; hasPassword: boolean }) : null;
  } catch {
    return null;
  }
}

/** Сменить пароль (нужен текущий); остальные устройства выйдут из кабинета. */
export async function changePassword(current: string, next: string): Promise<void> {
  const res = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ current, next }),
  }).catch(() => null);
  if (!res) throw new Error('Сервер не отвечает. Проверьте, что Канбат запущен.');
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message ?? `Ошибка (${res.status})`);
  }
}

/** Обновить данные кабинета, не трогая токен (настройки поменяли здесь или на другом устройстве). */
function replaceUser(user: User) {
  const { token } = useSession.getState();
  if (token) useSession.getState().set({ token, user });
}

/** Сохранить цветовую схему в кабинете (ТЗ v4.11). Без входа — только в этом браузере. */
export async function saveScheme(scheme: string): Promise<void> {
  if (!sessionToken()) return;
  const res = await fetch('/api/auth/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ scheme }),
  }).catch(() => null);
  if (res?.status === 401) return sessionExpired();
  const data = (await res?.json().catch(() => null)) as { user?: User } | null;
  if (res?.ok && data?.user) replaceUser(data.user);
}

let lastRefresh = 0;
/**
 * Подтянуть кабинет с сервера: при запуске и при возврате во вкладку (не чаще раза в минуту) —
 * так цвет, выбранный на телефоне, появляется и на ноутбуке.
 */
export async function refreshUser(force = false): Promise<void> {
  if (!sessionToken() || (!force && Date.now() - lastRefresh < 60_000)) return;
  lastRefresh = Date.now();
  const res = await fetch('/api/auth/me', { headers: authHeaders() }).catch(() => null);
  if (res?.status === 401) return sessionExpired();
  const data = (await res?.json().catch(() => null)) as { user?: User } | null;
  if (res?.ok && data?.user) replaceUser(data.user);
}
