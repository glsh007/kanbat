import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth.guard';
import { STORAGE, type Storage, type User } from '../store/types';

/** Предел одной доски (задачи + переписка), чтобы файл не разрастался бесконечно. */
const MAX_BOARD = 5 * 1024 * 1024;

/** Доска пользователя: клиент хранит её состояние у себя и сохраняет сюда целиком. */
@Controller('board')
export class BoardController {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  @Get()
  async get(@CurrentUser() user: User) {
    return { board: await this.storage.getBoard(user.id) };
  }

  @Put()
  async put(@CurrentUser() user: User, @Body() body: { data?: unknown; baseRev?: unknown }) {
    if (typeof body?.data !== 'string') throw new BadRequestException('data должен быть строкой');
    if (body.data.length > MAX_BOARD)
      throw new BadRequestException('Доска слишком большая — удалите старые задачи');
    try {
      JSON.parse(body.data);
    } catch {
      throw new BadRequestException('data — не JSON');
    }
    // Окно сохраняет поверх версии, которую видело. Если тем временем доску сохранило другое окно
    // (телефон, вторая вкладка) — 409 и текущая доска: клиент сольёт обе версии, ничего не потеряв.
    if (typeof body.baseRev === 'number') {
      const cur = await this.storage.getBoard(user.id);
      if (cur && cur.rev !== body.baseRev)
        throw new ConflictException({
          statusCode: 409,
          message: 'Доска изменилась в другом окне',
          board: { data: cur.data, rev: cur.rev },
        });
    }
    const blob = await this.storage.putBoard(user.id, body.data);
    return { rev: blob.rev, updatedAt: blob.updatedAt };
  }
}
