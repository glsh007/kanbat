import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';

@Module({
  imports: [OrgModule],
  controllers: [LlmController],
  providers: [LlmService],
})
export class LlmModule {}
