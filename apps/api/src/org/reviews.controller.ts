import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/auth.guard';
import type { User } from '../store/types';
import { reviewView } from './reviews';
import { ReviewsService } from './reviews.service';

/** Разбор ошибок (ТЗ v4.29): прислать ответ — любой вошедший (по своему согласию), разбирать — администратор. */
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @HttpCode(200)
  add(@CurrentUser() user: User, @Body() body: unknown) {
    return this.reviews.add(body, user);
  }

  @AdminOnly()
  @Get()
  async list() {
    return { reviews: (await this.reviews.list()).map(reviewView).reverse() };
  }

  @AdminOnly()
  @Post(':id/resolve')
  @HttpCode(200)
  async resolve(@Param('id') id: string, @Body() body: { outcome?: unknown }) {
    return reviewView(await this.reviews.resolve(id, body?.outcome));
  }
}
