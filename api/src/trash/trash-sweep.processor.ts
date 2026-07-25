import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { TrashService } from './trash.service';
import { QUEUE } from '../jobs/queue.constants';

/**
 * Job định kỳ dọn Thùng rác quá hạn (mục 7.E giai đoạn 2 / 11.K).
 * Chạy 1 lần/ngày (đăng ký repeatable job ở TrashSweepScheduler) — quét toàn
 * hệ thống, xoá vĩnh viễn mọi trash root đã quá TRASH_RETENTION_DAYS.
 */
@Processor(QUEUE.TRASH_SWEEP)
export class TrashSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(TrashSweepProcessor.name);

  constructor(private readonly trash: TrashService) {
    super();
  }

  async process(): Promise<void> {
    const count = await this.trash.purgeExpired();
    if (count > 0) {
      this.logger.log(`Đã xoá vĩnh viễn ${count} mục Thùng rác quá hạn.`);
    }
  }
}
