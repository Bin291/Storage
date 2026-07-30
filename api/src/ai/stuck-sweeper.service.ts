import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AiPipelineJob, QUEUE, ThumbnailJob } from '../jobs/queue.constants';

/**
 * Tự phục hồi file kẹt 'processing' (mục 7.B).
 * Khi server restart giữa chừng, job BullMQ có thể mất -> file kẹt 'processing' mãi.
 * Quét sau khi boot: file 'processing' cũ hơn ngưỡng -> đẩy lại job (idempotent).
 */
@Injectable()
export class StuckSweeperService implements OnModuleInit {
  private readonly logger = new Logger(StuckSweeperService.name);
  private readonly STALE_MINUTES = 5;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.AI_PIPELINE)
    private readonly aiQueue: Queue<AiPipelineJob>,
    @InjectQueue(QUEUE.THUMBNAIL)
    private readonly thumbQueue: Queue<ThumbnailJob>,
  ) {}

  onModuleInit(): void {
    // Chờ app ổn định rồi mới quét (không chặn khởi động).
    setTimeout(() => void this.sweep(), 30_000);
  }

  private async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - this.STALE_MINUTES * 60_000);
    let stuck: { id: string; userId: string }[] = [];
    try {
      stuck = await this.prisma.file.findMany({
        where: { status: 'processing', updatedAt: { lt: cutoff } },
        select: { id: true, userId: true },
        take: 200,
      });
    } catch (err) {
      this.logger.warn(`Sweep bỏ qua (DB chưa sẵn sàng): ${(err as Error).message}`);
      return;
    }
    if (stuck.length === 0) return;

    const opts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 500,
    };
    for (const f of stuck) {
      await this.thumbQueue.add('thumbnail', { fileId: f.id, userId: f.userId }, opts);
      await this.aiQueue.add('ai-pipeline', { fileId: f.id, userId: f.userId }, opts);
    }
    this.logger.log(`Đẩy lại xử lý cho ${stuck.length} file kẹt 'processing'.`);
  }
}
