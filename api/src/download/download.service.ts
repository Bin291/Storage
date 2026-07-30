import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Readable } from 'node:stream';
import { PrismaService } from '../infra/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CacheService } from '../infra/cache/cache.service';
import { QUEUE, ZipJob } from '../jobs/queue.constants';

export interface ZipStatus {
  status: 'preparing' | 'ready' | 'error';
  url?: string;
  error?: string;
}

@Injectable()
export class DownloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    @InjectQueue(QUEUE.ZIP) private readonly zipQueue: Queue<ZipJob>,
  ) {}

  /**
   * URL tải/preview 1 file. Ưu tiên CDN public (cache tốt, hỗ trợ Range —
   * mục 5.C); nếu chưa cấu hình public domain thì presigned GET.
   */
  async fileUrl(userId: string, fileId: string): Promise<{ url: string }> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, status: { not: 'delete_pending' } },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');

    const cacheKey = `dl:${userId}:${fileId}`;
    const cached = await this.cache.get<{ url: string }>(cacheKey);
    if (cached) return cached;

    const publicUrl = this.storage.publicUrl(file.r2Key);
    const url = publicUrl ?? (await this.storage.presignDownload(file.r2Key, 3600));
    const result = { url };
    // TTL ngắn hơn thời hạn presign để không trả URL sắp hết hạn.
    await this.cache.set(cacheKey, result, publicUrl ? 300 : 1800);
    return result;
  }

  /**
   * URL tải xuống THẬT (nút "Tải xuống" — mục 11.J): luôn presigned trực
   * tiếp (bỏ qua CDN public) để ép `Content-Disposition: attachment` kèm
   * đúng tên gốc — tách khỏi `fileUrl()` (dùng cho nhúng xem trước img/
   * video/audio/iframe) vì `attachment` sẽ phá luôn PDF preview trong iframe
   * nếu dùng chung 1 URL.
   */
  async downloadUrl(userId: string, fileId: string): Promise<{ url: string }> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, status: { not: 'delete_pending' } },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    const url = await this.storage.presignDownload(file.r2Key, 3600, file.name, 'attachment');
    return { url };
  }

  /**
   * Bytes gốc của file, QUA backend (mục 11.I — xem trước DOCX/XLSX).
   * Thư viện render phía client (docx-preview/xlsx) cần `fetch()` đọc được
   * response, phụ thuộc CORS trực tiếp GCS — thay vì cấu hình CORS GCS (rủi ro,
   * xem ghi chú upload mục 5.A), proxy qua chính backend NestJS đã bật CORS
   * đúng origin sẵn (mục 3), giống hệt triết lý proxy upload.
   */
  async fileBlob(
    userId: string,
    fileId: string,
  ): Promise<{ stream: Readable; mimeType: string; name: string }> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, status: { not: 'delete_pending' } },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    const stream = await this.storage.getObjectStream(file.r2Key);
    return { stream, mimeType: file.mimeType, name: file.name };
  }

  /**
   * Văn bản đã trích xuất sẵn cho AI Search (mục 8.C) — tái dùng làm preview
   * dự phòng cho loại tài liệu chưa có renderer trực quan (pptx/odt/rtf...).
   */
  async fileText(userId: string, fileId: string): Promise<{ text: string }> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, status: { not: 'delete_pending' } },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    try {
      const buf = await this.storage.getObjectBuffer(this.storage.artifactKey(userId, fileId));
      return { text: buf.toString('utf-8') };
    } catch {
      throw new NotFoundException('Chưa có bản trích xuất văn bản cho tệp này');
    }
  }

  private zipStatusKey(userId: string, jobId: string): string {
    return `zip:${userId}:${jobId}`;
  }

  /** Bắt đầu nén folder bất đồng bộ (mục 5.E). */
  async startFolderZip(
    userId: string,
    folderId: string,
  ): Promise<{ jobId: string }> {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId },
    });
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
    return this.enqueueZip(userId, [], [folderId]);
  }

  /**
   * Bắt đầu nén nhiều mục đã chọn (mục 11.J — bulk download kiểu Drive):
   * chọn hỗn hợp file rời rạc + cả folder cùng lúc, mỗi folder giữ nguyên
   * cây con, file rời rạc nằm thẳng gốc zip.
   */
  async startBulkZip(
    userId: string,
    fileIds: string[],
    folderIds: string[],
  ): Promise<{ jobId: string }> {
    if (fileIds.length === 0 && folderIds.length === 0) {
      throw new NotFoundException('Chưa chọn mục nào để tải xuống');
    }
    // Xác thực sở hữu trước khi enqueue — tránh job chạy rỗng vì id sai/của người khác.
    const [ownedFiles, ownedFolders] = await Promise.all([
      fileIds.length
        ? this.prisma.file.count({ where: { userId, id: { in: fileIds } } })
        : 0,
      folderIds.length
        ? this.prisma.folder.count({ where: { userId, id: { in: folderIds } } })
        : 0,
    ]);
    if (ownedFiles !== fileIds.length || ownedFolders !== folderIds.length) {
      throw new NotFoundException('Một số mục không tồn tại hoặc không thuộc về bạn');
    }
    return this.enqueueZip(userId, fileIds, folderIds);
  }

  private async enqueueZip(
    userId: string,
    fileIds: string[],
    folderIds: string[],
  ): Promise<{ jobId: string }> {
    const jobId = crypto.randomUUID();
    await this.cache.set(
      this.zipStatusKey(userId, jobId),
      { status: 'preparing' } satisfies ZipStatus,
      3600,
    );
    await this.zipQueue.add('zip-bulk', { userId, jobId, fileIds, folderIds });
    return { jobId };
  }

  async zipStatus(userId: string, jobId: string): Promise<ZipStatus> {
    const status = await this.cache.get<ZipStatus>(
      this.zipStatusKey(userId, jobId),
    );
    return status ?? { status: 'error', error: 'Không tìm thấy tác vụ' };
  }
}
