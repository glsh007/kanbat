import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { STORAGE, type Storage, type User, type UserRole } from '../store/types';
import { parsePhoto, PRESETS } from './avatars';
import { AttemptGuard, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from './password';
import { newPhrase, normalizePhrase, PHRASE_WORDS } from './words';

const NAME_MAX = 40;
const NAME_MIN = 2;

/** Ник (ТЗ v4.17): латиница, цифры, «_», начинается с буквы, 3–20 символов. */
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const RESERVED = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'kanbat',
  'system',
  'moderator',
  'specialist',
  'help',
  'api',
  'null',
  'undefined',
  'me',
  'bot',
  'ai',
]);
export const cleanUsername = (raw: unknown) =>
  typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';

/** Почему ник не подходит (null — подходит по форме; занятость проверяется отдельно). */
export function usernameProblem(u: string): string | null {
  if (!u) return 'Придумайте ник';
  if (u.length < 3) return 'Ник — не короче 3 символов';
  if (u.length > 20) return 'Ник — не длиннее 20 символов';
  if (!/^[a-z]/.test(u)) return 'Ник начинается с латинской буквы';
  if (!USERNAME.test(u)) return 'Только латинские буквы, цифры и «_»';
  if (RESERVED.has(u)) return 'Этот ник зарезервирован';
  return null;
}
const LOCKED = 'Слишком много неверных попыток. Вход закрыт на 10 минут.';

/** Пользователь для ответа клиенту — без хэшей пароля и фразы восстановления. */
export type PublicUser = Omit<User, 'passwordHash' | 'recoveryHash'> & { hasRecovery: boolean };
export const publicUser = ({ passwordHash: _hash, recoveryHash, ...rest }: User): PublicUser => ({
  ...rest,
  hasRecovery: !!recoveryHash,
});

const DAY = 24 * 3_600_000;

/** Цветовые схемы — как в packages/tokens (palette.ts, colorSchemes); API пакет токенов не подключает. */
export const COLOR_SCHEMES = ['terracotta', 'sage', 'sea', 'plum', 'ochre', 'graphite'] as const;

/** Сравнение кодов за одно и то же время (без подсказки по длине совпадения). */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const cleanName = (raw: unknown) =>
  typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';

/**
 * Личные кабинеты (ТЗ v4.6, п. 15): имя + пароль. Новое имя — новый кабинет, пароль придумывается
 * при первом входе. Кабинеты, созданные до паролей, получают пароль при следующем входе.
 * Специалист дополнительно вводит общий код доступа.
 */
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private supportCode = '';
  private adminCode = '';
  /** Код специалиста: 5 ошибок с адреса или 30 всего за 10 минут. */
  private readonly codeGuard = new AttemptGuard(5, 30);
  /** Пароль: 10 ошибок с адреса или по кабинету за 10 минут (всего — 300, чтобы не мешать всем). */
  private readonly passwordGuard = new AttemptGuard(10, 300);
  /** Регистрации: 20 с адреса за 10 минут (от массового создания кабинетов). */
  private readonly registerGuard = new AttemptGuard(
    config.registerLimit,
    config.registerLimit * 50,
  );

  /** Восстановление доступа по фразе: 5 ошибок с адреса или по кабинету за 10 минут. */
  private readonly recoverGuard = new AttemptGuard(5, 100);
  private sweep: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  /** Код специалиста: из SUPPORT_CODE или сгенерированный один раз и сохранённый в данных. */
  async onModuleInit() {
    this.supportCode = config.supportCode ?? (await this.generated('supportCode', 6));
    // код администратора длиннее: он даёт доступ к настройкам помощника
    this.adminCode = config.adminCode ?? (await this.generated('adminCode', 8));
    if (this.adminCode === this.supportCode)
      console.warn('ADMIN_CODE совпадает с SUPPORT_CODE — любой специалист станет администратором');
    // автоудаление неактивных (ТЗ v4.18): при запуске и раз в 6 часов
    void this.pruneIdle();
    this.sweep = setInterval(() => void this.pruneIdle(), 6 * 3_600_000);
    this.sweep.unref?.();
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
  }

  /**
   * Удаляет аккаунты, где человек включил «Удалить после года без входа» и не заходил
   * `IDLE_DELETE_DAYS` (365) дней. Возвращает число удалённых.
   */
  async pruneIdle(now = Date.now()): Promise<number> {
    let n = 0;
    for (const u of await this.storage.listUsers()) {
      if (!u.autoDelete) continue;
      const seen = Date.parse(u.lastActiveAt ?? u.createdAt);
      if (!Number.isFinite(seen) || now - seen <= config.idleDeleteDays * DAY) continue;
      await this.storage.deleteUser(u.id);
      console.log(
        `Автоудаление: @${u.username ?? u.name} не заходил(а) ${config.idleDeleteDays} дн.`,
      );
      n++;
    }
    return n;
  }

  /** Код, придуманный сервером один раз и сохранённый в данных. */
  private async generated(key: string, digits: number): Promise<string> {
    let code = await this.storage.getMeta(key);
    if (!code) {
      code = String(randomInt(10 ** (digits - 1), 10 ** digits));
      await this.storage.setMeta(key, code);
    }
    return code;
  }

  get code() {
    return this.supportCode;
  }

  get admin() {
    return this.adminCode;
  }

  /** Есть ли кабинет с таким именем (экран входа: «придумайте пароль» или «введите пароль»). */
  async check(nameRaw: unknown, roleRaw: unknown) {
    const name = cleanName(nameRaw);
    if (!name || name.length > NAME_MAX) return { exists: false, hasPassword: false };
    const role: UserRole = roleRaw === 'specialist' ? 'specialist' : 'employee';
    const user = await this.storage.findUser(name, role);
    return { exists: !!user, hasPassword: !!user?.passwordHash };
  }

  async login(
    nameRaw: unknown,
    roleRaw: unknown,
    codeRaw: unknown,
    passwordRaw: unknown,
    ip = 'unknown',
  ) {
    const name = cleanName(nameRaw);
    if (!name) throw new BadRequestException('Введите имя');
    if (name.length > NAME_MAX)
      throw new BadRequestException(`Имя — не длиннее ${NAME_MAX} символов`);
    const role: UserRole = roleRaw === 'specialist' ? 'specialist' : 'employee';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!password) throw new BadRequestException('Введите пароль');
    if (password.length > PASSWORD_MAX)
      throw new BadRequestException(`Пароль — не длиннее ${PASSWORD_MAX} символов`);

    // вход по нику (ТЗ v4.17); кабинеты до регистрации — по имени и роли, как раньше
    const byNick = await this.storage.findByUsername(cleanUsername(name));
    let user = byNick ?? (await this.storage.findUser(name, role));
    if (!user)
      throw new UnauthorizedException('Такого кабинета нет. Проверьте ник или зарегистрируйтесь.');
    if (user.role !== role)
      throw new BadRequestException(
        user.role === 'specialist'
          ? 'Это кабинет специалиста: выберите роль «Специалист» и введите код'
          : 'Это кабинет сотрудника: выберите роль «Сотрудник»',
      );
    // специалист вводит код специалиста или код администратора (ТЗ v4.12)
    const admin = role === 'specialist' ? this.checkCode(codeRaw, ip) : false;
    const created = false;
    if (!user.passwordHash) {
      // кабинет, созданный до паролей: пароль придумывается сейчас
      if (password.length < PASSWORD_MIN)
        throw new BadRequestException(`Пароль — не короче ${PASSWORD_MIN} символов`);
      user = await this.storage.updateUser({ ...user, passwordHash: await hashPassword(password) });
    } else {
      const account = `user:${user.id}`;
      if (this.passwordGuard.blocked(ip, account))
        throw new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
      if (!(await verifyPassword(password, user.passwordHash))) {
        this.passwordGuard.fail(ip, account);
        throw new UnauthorizedException('Неверный пароль');
      }
    }

    // права администратора — по коду, введённому при этом входе (вошли с кодом специалиста — сняты)
    if (role === 'specialist' && !!user.admin !== admin)
      user = await this.storage.updateUser({ ...user, admin });

    const token = randomBytes(24).toString('base64url');
    await this.storage.createSession(token, user.id);
    return { token, user: publicUser(user), created };
  }

  /** Код специалиста или администратора; true — это код администратора. */
  private checkCode(codeRaw: unknown, ip: string): boolean {
    if (this.codeGuard.blocked(ip)) throw new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
    const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';
    const admin = same(code, this.adminCode);
    if (!admin && !same(code, this.supportCode)) {
      this.codeGuard.fail(ip);
      throw new UnauthorizedException('Неверный код специалиста');
    }
    return admin;
  }

  /** Свободен ли ник (экран регистрации проверяет на лету). */
  async usernameStatus(raw: unknown) {
    const u = cleanUsername(raw);
    const problem = usernameProblem(u);
    if (problem) return { available: false, reason: problem };
    const taken = await this.storage.findByUsername(u);
    return taken ? { available: false, reason: 'Ник занят' } : { available: true, reason: null };
  }

  /**
   * Регистрация (ТЗ v4.17): имя, ник, пароль, роль (специалисту — код). Храним только имя, ник,
   * роль и хэш пароля. Почту не спрашиваем: для писем нужен почтовый сервер — это следующий шаг.
   */
  async register(
    body: {
      name?: unknown;
      username?: unknown;
      password?: unknown;
      role?: unknown;
      code?: unknown;
    },
    ip = 'unknown',
  ) {
    const name = cleanName(body?.name);
    if (name.length < NAME_MIN)
      throw new BadRequestException('Как к вам обращаться? Не короче 2 символов');
    if (name.length > NAME_MAX)
      throw new BadRequestException(`Имя — не длиннее ${NAME_MAX} символов`);
    const username = cleanUsername(body?.username);
    const problem = usernameProblem(username);
    if (problem) throw new BadRequestException(problem);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < PASSWORD_MIN)
      throw new BadRequestException(`Пароль — не короче ${PASSWORD_MIN} символов`);
    if (password.length > PASSWORD_MAX)
      throw new BadRequestException(`Пароль — не длиннее ${PASSWORD_MAX} символов`);
    const role: UserRole = body?.role === 'specialist' ? 'specialist' : 'employee';
    if (this.registerGuard.blocked(ip))
      throw new HttpException(
        'Слишком много регистраций с этого адреса. Попробуйте позже.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const admin = role === 'specialist' ? this.checkCode(body?.code, ip) : false;
    if (await this.storage.findByUsername(username))
      throw new ConflictException('Ник занят — придумайте другой');
    this.registerGuard.fail(ip);
    // фраза для восстановления доступа (ТЗ v4.18): показывается один раз, храним только хэш
    const recoveryPhrase = newPhrase();
    const at = new Date().toISOString();
    const user = await this.storage.createUser({
      id: randomUUID(),
      name,
      username,
      role,
      ...(admin ? { admin: true } : {}),
      passwordHash: await hashPassword(password),
      recoveryHash: await hashPassword(recoveryPhrase),
      recoveryAt: at,
      createdAt: at,
    });
    console.log(
      `Регистрация: @${username} (${role === 'specialist' ? 'специалист' : 'сотрудник'})`,
    );
    const token = randomBytes(24).toString('base64url');
    await this.storage.createSession(token, user.id);
    return { token, user: publicUser(user), created: true, recoveryPhrase };
  }

  /** Новая фраза восстановления (старая перестаёт работать). Нужен текущий пароль. */
  async newRecovery(user: User, passwordRaw: unknown) {
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (fresh.passwordHash) {
      const account = `user:${fresh.id}`;
      if (this.passwordGuard.blocked(account))
        throw new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
      if (!(await verifyPassword(password, fresh.passwordHash))) {
        this.passwordGuard.fail(account);
        throw new UnauthorizedException('Неверный пароль');
      }
    }
    const phrase = newPhrase();
    const next = await this.storage.updateUser({
      ...fresh,
      recoveryHash: await hashPassword(phrase),
      recoveryAt: new Date().toISOString(),
    });
    return { phrase, user: publicUser(next) };
  }

  /**
   * «Забыли пароль?» (ТЗ v4.18): ник + фраза из 6 слов → новый пароль. Все входы закрываются,
   * фраза меняется на новую (старую могли подсмотреть). Сразу не входим: дальше — обычный вход
   * (специалисту — с кодом).
   */
  async recover(
    body: { username?: unknown; phrase?: unknown; password?: unknown },
    ip = 'unknown',
  ) {
    const username = cleanUsername(body?.username);
    const phrase = normalizePhrase(body?.phrase);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username) throw new BadRequestException('Введите ник');
    if (phrase.split(' ').length !== PHRASE_WORDS)
      throw new BadRequestException(`Во фразе ${PHRASE_WORDS} слов — проверьте, все ли введены`);
    if (password.length < PASSWORD_MIN)
      throw new BadRequestException(`Новый пароль — не короче ${PASSWORD_MIN} символов`);
    if (password.length > PASSWORD_MAX)
      throw new BadRequestException(`Пароль — не длиннее ${PASSWORD_MAX} символов`);
    const account = `recover:${username}`;
    if (this.recoverGuard.blocked(ip, account))
      throw new HttpException(
        'Слишком много попыток. Попробуйте через 10 минут.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const user = await this.storage.findByUsername(username);
    // одинаковый ответ, есть ли такой ник и есть ли у него фраза
    if (!user?.recoveryHash || !(await verifyPassword(phrase, user.recoveryHash))) {
      this.recoverGuard.fail(ip, account);
      throw new UnauthorizedException('Ник или фраза не подходят');
    }
    const fresh = newPhrase();
    await this.storage.updateUser({
      ...user,
      passwordHash: await hashPassword(password),
      recoveryHash: await hashPassword(fresh),
      recoveryAt: new Date().toISOString(),
    });
    await this.storage.deleteSessionsOf(user.id);
    console.log(`Восстановлен доступ: @${username}`);
    return { ok: true, username, role: user.role, recoveryPhrase: fresh };
  }

  /**
   * Аватарка (ТЗ v4.18): готовый рисунок (`preset`), своё фото (`photo`, data URL после обрезки
   * в браузере) или убрать (`remove`).
   */
  async setAvatar(user: User, body: { preset?: unknown; photo?: unknown; remove?: unknown }) {
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    let avatar: string | undefined;
    if (body?.remove === true) {
      await this.storage.setAvatar(fresh.id, null);
      avatar = undefined;
    } else if (typeof body?.preset === 'string') {
      if (!PRESETS[body.preset]) throw new BadRequestException('Такого рисунка нет');
      await this.storage.setAvatar(fresh.id, null);
      avatar = `preset:${body.preset}`;
    } else if (body?.photo !== undefined) {
      const photo = parsePhoto(body.photo);
      if (typeof photo === 'string') throw new BadRequestException(photo);
      await this.storage.setAvatar(fresh.id, {
        mime: photo.mime,
        data: photo.data.toString('base64'),
      });
      avatar = `photo:${Date.now().toString(36)}`;
    } else throw new BadRequestException('Выберите рисунок или фото');
    const { avatar: _old, ...rest } = fresh;
    return publicUser(await this.storage.updateUser(avatar ? { ...rest, avatar } : rest));
  }

  /** Специалист убирает чужую аватарку, нарушающую правила (ТЗ v4.18). */
  async removeAvatarOf(id: string) {
    const u = await this.storage.getUser(id);
    if (!u) throw new NotFoundException('Человек не найден');
    await this.storage.setAvatar(u.id, null);
    const { avatar: _old, ...rest } = u;
    await this.storage.updateUser(rest);
    return { ok: true };
  }

  /** Ник для кабинета, созданного до регистрации (задаётся один раз). */
  async setUsername(user: User, raw: unknown) {
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    if (fresh.username) throw new BadRequestException('Ник уже выбран');
    const u = cleanUsername(raw);
    const problem = usernameProblem(u);
    if (problem) throw new BadRequestException(problem);
    if (await this.storage.findByUsername(u))
      throw new ConflictException('Ник занят — придумайте другой');
    return publicUser(await this.storage.updateUser({ ...fresh, username: u }));
  }

  /** Сменить пароль: нужен текущий. Остальные устройства выходят из кабинета. */
  async changePassword(user: User, token: string, currentRaw: unknown, nextRaw: unknown) {
    const current = typeof currentRaw === 'string' ? currentRaw : '';
    const next = typeof nextRaw === 'string' ? nextRaw : '';
    if (next.length < PASSWORD_MIN)
      throw new BadRequestException(`Новый пароль — не короче ${PASSWORD_MIN} символов`);
    if (next.length > PASSWORD_MAX)
      throw new BadRequestException(`Пароль — не длиннее ${PASSWORD_MAX} символов`);
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    if (fresh.passwordHash) {
      const account = `user:${fresh.id}`;
      if (this.passwordGuard.blocked(account))
        throw new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
      if (!(await verifyPassword(current, fresh.passwordHash))) {
        this.passwordGuard.fail(account);
        throw new UnauthorizedException('Текущий пароль неверный');
      }
    }
    await this.storage.updateUser({ ...fresh, passwordHash: await hashPassword(next) });
    await this.storage.deleteSessionsOf(fresh.id, token);
  }

  /** Личные настройки кабинета, которые должны быть одинаковыми на всех устройствах. */
  async setPrefs(
    user: User,
    body: { scheme?: unknown; autoDelete?: unknown; dmOff?: unknown },
  ): Promise<PublicUser> {
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    const next = { ...fresh };
    if (body.dmOff !== undefined) {
      if (typeof body.dmOff !== 'boolean') throw new BadRequestException('dmOff — да или нет');
      next.dmOff = body.dmOff;
    }
    if (body.autoDelete !== undefined) {
      if (typeof body.autoDelete !== 'boolean')
        throw new BadRequestException('autoDelete — да или нет');
      next.autoDelete = body.autoDelete;
      // отсчёт года — с этой минуты (у старых кабинетов отметки активности ещё нет)
      next.lastActiveAt = new Date().toISOString();
    }
    if (body.scheme !== undefined) {
      if (!COLOR_SCHEMES.includes(body.scheme as (typeof COLOR_SCHEMES)[number]))
        throw new BadRequestException('Такой цветовой схемы нет');
      next.scheme = body.scheme as string;
    }
    return publicUser(await this.storage.updateUser(next));
  }

  async userByToken(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const id = await this.storage.userIdBySession(token);
    return id ? this.storage.getUser(id) : null;
  }

  /** Удалить свой аккаунт и все данные (доска, входы на всех устройствах, обращения). */
  async deleteAccount(user: User) {
    await this.storage.deleteUser(user.id);
    console.log(`Удалён пользователь: ${user.name}`);
  }

  async logout(token: string) {
    await this.storage.deleteSession(token);
  }
}
