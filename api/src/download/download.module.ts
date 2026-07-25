import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../jobs/queue.constants';
import { DownloadService } from './download.service';
import { DownloadController } from './download.controller';
import { ZipProcessor } from './zip.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.ZIP })],
  controllers: [DownloadController],
  providers: [DownloadService, ZipProcessor],
})
export class DownloadModule {}
