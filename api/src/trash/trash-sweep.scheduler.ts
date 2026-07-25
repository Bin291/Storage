import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '../jobs/queue.constants';

/**
 * Đăng ký repeatable job quét Thùng rác quá hạn (mục 7.E/11.K) — chạy 03:00
 * mỗi ngày. `jobId` cố định để BullMQ tự dedupe, không tạo job trùng mỗi lần
 * server restart.
 */
@Injectable()
export class TrashSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(TrashSweepScheduler.name);

  constructor(
    @InjectQueue(QUEUE.TRASH_SWEEP) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'sweep',
      {},
      {
        jobId: 'daily-trash-sweep',
        repeat: { pattern: '0 3 * * *' },
        removeOnComplete: true,
        removeOnFail: 20,
      },
    );
    this.logger.log('Đã đăng ký job quét Thùng rác quá hạn (03:00 mỗi ngày).');
  }
}
