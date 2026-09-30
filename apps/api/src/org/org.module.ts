import { Module } from '@nestjs/common';
import { AnswersController } from './answers.controller';
import { BrandController } from './brand.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { AnswersService } from './answers.service';
import { OrgController } from './org.controller';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { OrgService } from './org.service';
import { SamplesController } from './samples.controller';
import { SamplesService } from './samples.service';

@Module({
  controllers: [
    OrgController,
    AnswersController,
    RulesController,
    SamplesController,
    BrandController,
    ReviewsController,
  ],
  providers: [OrgService, AnswersService, RulesService, SamplesService, ReviewsService],
  exports: [OrgService, AnswersService, RulesService, SamplesService],
})
export class OrgModule {}
