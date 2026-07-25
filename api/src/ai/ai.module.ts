import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { AiEmbeddingService } from './ai-embedding.service';
import { DocumentParserService } from './document-parser.service';
import { ThumbnailService } from './thumbnail.service';
import { AiPipelineProcessor } from './ai-pipeline.processor';
import { ThumbnailProcessor } from './thumbnail.processor';
import { StuckSweeperService } from './stuck-sweeper.service';
import { AiController } from './ai.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE.AI_PIPELINE },
      { name: QUEUE.THUMBNAIL },
    ),
  ],
  controllers: [AiController],
  providers: [
    AiEmbeddingService,
    DocumentParserService,
    ThumbnailService,
    AiPipelineProcessor,
    ThumbnailProcessor,
    StuckSweeperService,
  ],
  exports: [AiEmbeddingService],
})
export class AiModule {}
