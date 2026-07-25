import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CleanupJob, QUEUE } from './queue.constants';

/**
 * Cascading delete (mục 7.E): LUÔN xoá GCS trước, xoá DB sau.
 * Nếu xoá DB trước mà GCS lỗi thì mất đầu mối dọn rác (orphaned object).
 */
@Processor(QUEUE.CLEANUP)
export class CleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<CleanupJob>): Promise<void> {
    const { type, targetId, r2Keys } = job.data;

    // 1) Xoá mọi object trên GCS (idempotent).
    await Promise.all(r2Keys.map((key) => this.storage.deleteObject(key)));

    // 2) Hard-delete DB — Prisma cascade tự xoá con (file/folder/chunk).
    if (type === 'file') {
      await this.prisma.file.delete({ where: { id: targetId } }).catch((e) => {
        this.logger.warn(`File ${targetId} đã bị xoá trước đó: ${e.message}`);
      });
    } else {
      await this.prisma.folder.delete({ where: { id: targetId } }).catch((e) => {
        this.logger.warn(`Folder ${targetId} đã bị xoá trước đó: ${e.message}`);
      });
    }
    this.logger.log(`Đã dọn ${type} ${targetId} (${r2Keys.length} object GCS)`);
  }
}
