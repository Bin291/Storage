import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { File } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, CompletedPart } from '../storage/storage.service';
import { FilesService } from '../files/files.service';
import {
  AiPipelineJob,
  QUEUE,
  ThumbnailJob,
} from '../jobs/queue.constants';

export interface InitUploadResult {
  fileId: string;
  uploadId: string;
  key: string;
  partSize: number;
  partCount: number;
}

@Injectable()
export class UploadService {
  private readonly maxFileBytes: number;
  private readonly partSize: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly files: FilesService,
    @InjectQueue(QUEUE.AI_PIPELINE)
    private readonly aiQueue: Queue<AiPipelineJob>,
    @InjectQueue(QUEUE.THUMBNAIL)
    private readonly thumbQueue: Queue<ThumbnailJob>,
  ) {
    this.maxFileBytes =
      this.config.get<number>('limits.maxFileSizeMb', 2048) * 1024 * 1024;
    this.partSize =
      this.config.get<number>('limits.uploadChunkSizeMb', 8) * 1024 * 1024;
  }

  /** Xác minh file thuộc user và đang ở trạng thái uploading. */
  private async ownFile(userId: string, fileId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException('Không tìm thấy phiên upload');
    return file;
  }

  /** Mở phiên multipart trên GCS + tạo row File (mục 5.A). */
  async init(
    userId: string,
    dto: {
      name: string;
      extension: string;
      mimeType: string;
      size: string;
      folderId: string | null;
    },
  ): Promise<InitUploadResult> {
    const size = BigInt(dto.size);
    if (size <= 0n) throw new BadRequestException('Kích thước không hợp lệ');
    if (size > BigInt(this.maxFileBytes)) {
      throw new BadRequestException(
        `File vượt trần ${this.config.get('limits.maxFileSizeMb')}MB`,
      );
    }

    const file = await this.files.createPending(userId, {
      name: dto.name,
      extension: dto.extension,
      mimeType: dto.mimeType,
      size,
      folderId: dto.folderId,
    });

    const uploadId = await this.storage.createMultipartUpload(
      file.r2Key,
      dto.mimeType,
    );
    const partCount = Number(
      (size + BigInt(this.partSize) - 1n) / BigInt(this.partSize),
    );

    return {
      fileId: file.id,
      uploadId,
      key: file.r2Key,
      partSize: this.partSize,
      partCount,
    };
  }

  /** Presign URL cho các part cần upload (batch — lần đầu hoặc phần thiếu khi resume). */
  async partUrls(
    userId: string,
    fileId: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ partNumber: number; url: string }[]> {
    const file = await this.ownFile(userId, fileId);
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(file.r2Key, uploadId, partNumber),
      })),
    );
  }

  /** Upload 1 part QUA backend (proxy) — trình duyệt gửi bytes tới API, API đẩy lên GCS. */
  async uploadPart(
    userId: string,
    fileId: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<{ etag: string }> {
    if (!body || body.length === 0) {
      throw new BadRequestException('Part rỗng');
    }
    const file = await this.ownFile(userId, fileId);
    const etag = await this.storage.uploadPart(
      file.r2Key,
      uploadId,
      partNumber,
      body,
    );
    return { etag };
  }

  /** Resume: hỏi GCS các part đã nhận (mục 5.A — không cần bảng track riêng). */
  async listParts(
    userId: string,
    fileId: string,
    uploadId: string,
  ): Promise<CompletedPart[]> {
    const file = await this.ownFile(userId, fileId);
    return this.storage.listParts(file.r2Key, uploadId);
  }

  /** Ghép chunk → chuyển file sang 'processing' để pipeline AI/thumbnail xử lý (mục 5.B/7.A). */
  async complete(
    userId: string,
    fileId: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<File> {
    const file = await this.ownFile(userId, fileId);
    if (file.status !== 'uploading') {
      throw new ForbiddenException('Phiên upload đã kết thúc');
    }
    await this.storage.completeMultipartUpload(file.r2Key, uploadId, parts);
    // 'processing': worker (Mốc 5) sẽ trích text + embed + thumbnail rồi set 'ready'.
    const updated = await this.files.markStatus(userId, fileId, 'processing');

    // Đẩy job nền — không chặn response (mục 5.B/7.A).
    // Set opts thẳng ở đây để CHẮC CHẮN auto-retry (3 lần + backoff) dù queue
    // được đăng ký lại ở module khác không kèm defaultJobOptions.
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
    await this.aiQueue.add(
      'ai-pipeline',
      { fileId, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
    return updated;
  }

  async abort(
    userId: string,
    fileId: string,
    uploadId: string,
  ): Promise<void> {
    const file = await this.ownFile(userId, fileId);
    await this.storage.abortMultipartUpload(file.r2Key, uploadId);
    // Xoá row uploading dở dang.
    await this.prisma.file.deleteMany({
      where: { id: fileId, userId, status: 'uploading' },
    });
  }
}
