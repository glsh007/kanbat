import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { STORAGE, type Storage, type User, type UserRole } from '../store/types';
import { AttemptGuard, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from './password';

const NAME_MAX = 40;
const LOCKED = 'Слишком много неверных попыток. Вход закрыт на 10 минут.';

/** Пользователь для ответа клиенту — без хэша пароля. */
export type PublicUser = Omit<User, 'passwordHash'>;
export const publicUser = ({ passwordHash: _hash, ...rest }: User): PublicUser => rest;

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
export class AuthService implements OnModuleInit {
  private supportCode = '';
  private adminCode = '';
  /** Код специалиста: 5 ошибок с адреса или 30 всего за 10 минут. */
  private readonly codeGuard = new AttemptGuard(5, 30);
  /** Пароль: 10 ошибок с адреса или по кабинету за 10 минут (всего — 300, чтобы не мешать всем). */
  private readonly passwordGuard = new AttemptGuard(10, 300);

  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  /** Код специалиста: из SUPPORT_CODE или сгенерированный один раз и сохранённый в данных. */
  async onModuleInit() {
    this.supportCode = config.supportCode ?? (await this.generated('supportCode', 6));
    // код администратора длиннее: он даёт доступ к настройкам помощника
    this.adminCode = config.adminCode ?? (await this.generated('adminCode', 8));
    if (this.adminCode === this.supportCode)
      console.warn('ADMIN_CODE совпадает с SUPPORT_CODE — любой специалист станет администратором');
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

    // специалист вводит код специалиста или код администратора (ТЗ v4.12)
    let admin = false;
    if (role === 'specialist') {
      if (this.codeGuard.blocked(ip)) throw new HttpException(LOCKED, HttpStatus.TOO_MANY_REQUESTS);
      const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';
      admin = same(code, this.adminCode);
      if (!admin && !same(code, this.supportCode)) {
        this.codeGuard.fail(ip);
        throw new UnauthorizedException('Неверный код специалиста');
      }
    }

    let user = await this.storage.findUser(name, role);
    let created = false;
    if (!user || !user.passwordHash) {
      // новый кабинет или кабинет, созданный до паролей: пароль придумывается сейчас
      if (password.length < PASSWORD_MIN)
        throw new BadRequestException(`Пароль — не короче ${PASSWORD_MIN} символов`);
      const passwordHash = await hashPassword(password);
      if (user) user = await this.storage.updateUser({ ...user, passwordHash });
      else {
        created = true;
        user = await this.storage.createUser({
          id: randomUUID(),
          name,
          role,
          passwordHash,
          createdAt: new Date().toISOString(),
        });
        console.log(
          `Новый кабинет: ${name} (${role === 'specialist' ? 'специалист' : 'сотрудник'})`,
        );
      }
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
  async setPrefs(user: User, body: { scheme?: unknown }): Promise<PublicUser> {
    const fresh = await this.storage.getUser(user.id);
    if (!fresh) throw new UnauthorizedException('Войдите заново');
    const next = { ...fresh };
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
