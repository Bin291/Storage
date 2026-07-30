import {
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../infra/common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AiPipelineJob, QUEUE, ThumbnailJob } from '../jobs/queue.constants';
import { ThumbnailService } from './thumbnail.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class AiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbs: ThumbnailService,
    @InjectQueue(QUEUE.AI_PIPELINE) private readonly aiQueue: Queue<AiPipelineJob>,
    @InjectQueue(QUEUE.THUMBNAIL) private readonly thumbQueue: Queue<ThumbnailJob>,
  ) {}

  /** Thử lại xử lý AI cho file 'failed' (mục 7.B — nút "Thử lại"). */
  @Post('retry/:fileId')
  async retry(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');

    await this.prisma.file.update({
      where: { id: fileId },
      data: { status: 'processing', errorMessage: null },
    });
    const retryOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 100,
    };
    await this.thumbQueue.add('thumbnail', { fileId, userId }, retryOpts);
    await this.aiQueue.add('ai-pipeline', { fileId, userId }, retryOpts);
    return { status: 'processing' };
  }

  /**
   * Tạo lại RIÊNG ảnh xem trước (mục 11.I) — dùng khi file đã 'ready' (text/AI
   * đã xong) nhưng thumbnail bị lỗi thầm lặng (mục 7.C: lỗi render nuốt vào
   * log, không chặn status). KHÔNG đụng vào AI pipeline để tránh tốn lại quota
   * embedding cho 1 file vốn đã xử lý xong.
   */
  @Post('retry-thumbnail/:fileId')
  async retryThumbnail(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');

    await this.thumbQueue.add(
      'thumbnail',
      { fileId, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    return { status: 'queued' };
  }

  /**
   * Tạo lại ảnh xem trước cho MỌI file 'ready' đang thiếu thumbnail cùng lúc
   * (mục phản hồi UI: nhiều tệp docx/pdf/xlsx/audio tải lên trước khi có
   * pipeline sinh thumbnail nên chưa từng có ảnh xem trước — thay vì bấm
   * "Thử lại" từng file, người dùng bấm 1 lần để xếp hàng lại tất cả).
   */
  @Post('retry-missing-thumbnails')
  async retryMissingThumbnails(@CurrentUser('id') userId: string) {
    const files = await this.prisma.file.findMany({
      where: { userId, status: 'ready', thumbnailUrl: null },
      select: { id: true, extension: true },
    });
    const eligible = files.filter((f) => this.thumbs.supports(f.extension));
    const retryOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 100,
    };
    await Promise.all(
      eligible.map((f) =>
        this.thumbQueue.add('thumbnail', { fileId: f.id, userId }, retryOpts),
      ),
    );
    return { status: 'queued', count: eligible.length };
  }
}
