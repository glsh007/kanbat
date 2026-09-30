import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { FlowService } from './flow.service';
import { ChecksController } from '../checks/checks.controller';
import { ChecksService } from '../checks/checks.service';

@Module({
  imports: [OrgModule],
  controllers: [LlmController, ChecksController],
  providers: [LlmService, FlowService, ChecksService],
  exports: [LlmService, FlowService],
})
export class LlmModule {}
