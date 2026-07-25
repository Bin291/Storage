import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from './queue.constants';
import { CleanupProcessor } from './cleanup.processor';

/**
 * Đăng ký các hàng đợi BullMQ + processor. Global để mọi module inject queue.
 * Retry mặc định 3 lần + backoff exponential (mục 5.B).
 */
@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: QUEUE.CLEANUP,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
      {
        name: QUEUE.AI_PIPELINE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 500,
        },
      },
      {
        name: QUEUE.THUMBNAIL,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
      {
        name: QUEUE.ZIP,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
      {
        name: QUEUE.TRASH_SWEEP,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      },
    ),
  ],
  providers: [CleanupProcessor],
  exports: [BullModule],
})
export class JobsModule {}
