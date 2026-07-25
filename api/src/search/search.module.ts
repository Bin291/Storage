import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [AiModule], // dùng AiEmbeddingService
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
