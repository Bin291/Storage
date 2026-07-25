import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailJob, QUEUE } from '../jobs/queue.constants';
import { ThumbnailService } from './thumbnail.service';

/**
 * Sinh thumbnail nền (mục 7.A/7.C) — không chặn upload. Cập nhật File.thumbnailUrl,
 * Supabase Realtime tự đẩy về Angular để card tự hiện ảnh.
 */
@Processor(QUEUE.THUMBNAIL, { concurrency: 3 })
export class ThumbnailProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly thumbs: ThumbnailService,
  ) {
    super();
  }

  async process(job: Job<ThumbnailJob>): Promise<void> {
    const { fileId, userId } = job.data;
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file || file.status === 'delete_pending') return;
    if (!this.thumbs.supports(file.extension)) return; // để icon phía client

    const buffer = await this.storage.getObjectBuffer(file.r2Key);
    const thumb = await this.thumbs.generate(buffer, file.extension);
    if (!thumb) return;

    const key = this.storage.thumbnailKey(userId, fileId);
    await this.storage.putObject(key, thumb, 'image/webp');

    // Ưu tiên URL public CDN (grid gọi nhiều); fallback presigned dài hạn.
    const url =
      this.storage.publicUrl(key) ?? (await this.storage.presignDownload(key, 7 * 24 * 3600));
    await this.prisma.file.update({
      where: { id: fileId },
      data: { thumbnailUrl: url },
    });
    this.logger.log(`Thumbnail xong file ${fileId}`);
  }
}
