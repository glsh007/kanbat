import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.guard';
import type { User } from '../store/types';
import type { CommunityDraftInput } from './communities.service';
import { ForumService } from './forum.service';

/** БатФорум (ТЗ v4.2–4.7, п. 16). Все запросы — от вошедших пользователей. */
@Controller('forum')
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  // ——— сообщества ———

  @Get('sections')
  sections() {
    return this.forum.sections();
  }

  /** Специалист — создаёт, сотрудник — предлагает. */
  @Post('sections')
  @HttpCode(200)
  createSection(@CurrentUser() me: User, @Body() body: CommunityDraftInput) {
    return this.forum.createCommunity(me, body);
  }

  @Post('sections/:id')
  @HttpCode(200)
  updateSection(
    @CurrentUser() me: User,
    @Param('id') id: string,
    @Body() body: CommunityDraftInput,
  ) {
    return this.forum.updateCommunity(me, id, body);
  }

  @Post('sections/:id/archive')
  @HttpCode(200)
  archiveSection(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.archiveCommunity(me, id);
  }

  @Get('proposals')
  proposals(@CurrentUser() me: User) {
    return this.forum.proposals(me);
  }

  @Post('proposals/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() me: User, @Param('id') id: string, @Body() body: CommunityDraftInput) {
    return this.forum.approve(me, id, body ?? {});
  }

  @Post('proposals/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { note?: unknown }) {
    return this.forum.reject(me, id, body?.note);
  }

  // ——— «На проверке» ———

  @Get('review')
  review(@CurrentUser() me: User) {
    return this.forum.review(me);
  }

  @Get('review/count')
  reviewCount(@CurrentUser() me: User) {
    return this.forum.reviewCount(me);
  }

  // ——— темы ———

  @Get('threads')
  list(
    @CurrentUser() me: User,
    @Query('section') section?: string,
    @Query('sort') sort?: string,
    @Query('q') q?: string,
  ) {
    return this.forum.list(me, { section, sort, q: q?.slice(0, 300) });
  }

  @Get('similar')
  similar(@CurrentUser() me: User, @Query('q') q?: string) {
    return this.forum.similar(me, (q ?? '').slice(0, 600));
  }

  @Get('threads/:id')
  get(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.get(me, id);
  }

  @Post('threads')
  @HttpCode(200)
  create(
    @CurrentUser() me: User,
    @Body() body: { sectionId?: unknown; title?: unknown; body?: unknown; fromRequest?: unknown },
  ) {
    return this.forum.create(me, body);
  }

  @Post('threads/:id/replies')
  @HttpCode(200)
  reply(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { body?: unknown }) {
    return this.forum.reply(me, id, body?.body);
  }

  @Post('threads/:id/vote')
  @HttpCode(200)
  voteThread(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.voteThread(me, id);
  }

  @Post('replies/:id/vote')
  @HttpCode(200)
  voteReply(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.voteReply(me, id);
  }

  @Post('threads/:id/solution')
  @HttpCode(200)
  solution(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { replyId?: unknown }) {
    return this.forum.setSolution(me, id, body?.replyId ?? null);
  }

  @Post('threads/:id/pin')
  @HttpCode(200)
  pin(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { pinned?: unknown }) {
    return this.forum.pin(me, id, body?.pinned);
  }

  @Post('threads/:id/move')
  @HttpCode(200)
  move(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { sectionId?: unknown }) {
    return this.forum.move(me, id, body?.sectionId);
  }

  @Post('threads/:id/lock')
  @HttpCode(200)
  lock(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { locked?: unknown }) {
    return this.forum.lock(me, id, body?.locked);
  }

  @Post('threads/:id/title')
  @HttpCode(200)
  rename(@CurrentUser() me: User, @Param('id') id: string, @Body() body: { title?: unknown }) {
    return this.forum.rename(me, id, body?.title);
  }

  @Post('threads/:id/report')
  @HttpCode(200)
  report(
    @CurrentUser() me: User,
    @Param('id') id: string,
    @Body() body: { reason?: unknown; note?: unknown },
  ) {
    return this.forum.report(me, id, body ?? {});
  }

  @Post('threads/:id/reports/dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.dismissReports(me, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  async removeThread(@CurrentUser() me: User, @Param('id') id: string) {
    await this.forum.removeThread(me, id);
  }

  @Delete('replies/:id')
  @HttpCode(200)
  removeReply(@CurrentUser() me: User, @Param('id') id: string) {
    return this.forum.removeReply(me, id);
  }
}
