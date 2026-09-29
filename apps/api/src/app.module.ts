import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BoardController } from './board/board.controller';
import { CommunitiesService } from './forum/communities.service';
import { ForumController } from './forum/forum.controller';
import { ForumService } from './forum/forum.service';
import { DmController } from './dm/dm.controller';
import { DmService } from './dm/dm.service';
import { HealthController } from './health.controller';
import { LlmModule } from './llm/llm.module';
import { OrgModule } from './org/org.module';
import { StoreModule } from './store/store.module';
import { SupportController } from './support/support.controller';
import { SupportService } from './support/support.service';

@Module({
  imports: [StoreModule, AuthModule, OrgModule, LlmModule],
  controllers: [
    HealthController,
    BoardController,
    SupportController,
    ForumController,
    DmController,
  ],
  providers: [SupportService, ForumService, CommunitiesService, DmService],
})
export class AppModule {}
