import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, SpecialistOnly } from '../auth/auth.guard';
import type { User } from '../store/types';
import { DmService } from './dm.service';

/**
 * Бат-общение (ТЗ v4.19): личный вопрос по теме Бат-Форума, ответ, завершение, архив,
 * блокировка и жалоба. Поиска людей нет — спросить можно только того, кто отвечал в теме.
 */
@Controller('dm')
export class DmController {
  constructor(private readonly dm: DmService) {}

  @Get('profile/:key')
  profile(@CurrentUser() me: User, @Param('key') key: string) {
    return this.dm.profileOf(me, key);
  }

  @Get('chats')
  chats(@CurrentUser() me: User) {
    return this.dm.chats(me);
  }

  @Get('unread')
  unread(@CurrentUser() me: User) {
    return this.dm.unread(me);
  }

  /** «Спросить лично» / «Спросить снова»: тема, человек, вопрос. */
  @Post('requests')
  @HttpCode(200)
  request(
    @CurrentUser() me: User,
    @Body() body: { threadId?: unknown; userId?: unknown; text?: unknown },
  ) {
    return this.dm.request(me, body ?? {});
  }

  @Post('chats/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.decide(me, id, true);
  }

  @Post('chats/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.decide(me, id, false);
  }

  /** «Проблема решена» — спрашивающий. */
  @Post('chats/:id/solve')
  @HttpCode(200)
  solve(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.finish(me, id, 'solved');
  }

  /** «Больше помочь не могу» — помогающий. */
  @Post('chats/:id/end')
  @HttpCode(200)
  end(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.finish(me, id, 'helper_ended');
  }

  @Post('chats/:id/block')
  @HttpCode(200)
  block(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.block(me, id);
  }

  @Post('users/:id/unblock')
  @HttpCode(200)
  unblock(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.unblock(me, id);
  }

  /** Удалить переписку у обоих, без копий. */
  @Delete('chats/:id')
  remove(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.remove(me, id);
  }

  @Get('chats/:id/messages')
  messages(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.messages(me, id);
  }

  @Post('chats/:id/messages')
  @HttpCode(200)
  send(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { text?: unknown }) {
    return this.dm.send(me, id, body?.text);
  }

  @Post('chats/:id/report')
  @HttpCode(200)
  report(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { reason?: unknown }) {
    return this.dm.report(me, id, body?.reason);
  }

  // ——— архив: копии закрытых переписок, только свои ———

  @Get('archive')
  archive(@CurrentUser() me: User) {
    return this.dm.archive(me);
  }

  @Get('archive/:id')
  archived(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.archived(me, id);
  }

  @Delete('archive/:id')
  removeArchived(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.removeArchived(me, id);
  }

  // ——— специалист: жалобы на переписку (в «На проверке») ———

  @SpecialistOnly()
  @Get('reports')
  reports() {
    return this.dm.reports();
  }

  @SpecialistOnly()
  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() me: User, @Param('id') id: string) {
    return this.dm.resolveReport(me, id);
  }
}
