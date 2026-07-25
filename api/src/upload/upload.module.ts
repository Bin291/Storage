import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { FilesModule } from '../files/files.module';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  imports: [
    FilesModule,
    BullModule.registerQueue(
      { name: QUEUE.AI_PIPELINE },
      { name: QUEUE.THUMBNAIL },
    ),
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
