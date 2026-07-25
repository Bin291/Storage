import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.CLEANUP })],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
