import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { FilesModule } from '../files/files.module';
import { FoldersModule } from '../folders/folders.module';
import { TrashService } from './trash.service';
import { TrashController } from './trash.controller';
import { TrashSweepProcessor } from './trash-sweep.processor';
import { TrashSweepScheduler } from './trash-sweep.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE.TRASH_SWEEP }),
    FilesModule,
    FoldersModule,
  ],
  controllers: [TrashController],
  providers: [TrashService, TrashSweepProcessor, TrashSweepScheduler],
  exports: [TrashService],
})
export class TrashModule {}
