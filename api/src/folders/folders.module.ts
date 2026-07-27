import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { FoldersService } from './folders.service';
import { FoldersController } from './folders.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.CLEANUP }), FilesModule],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
