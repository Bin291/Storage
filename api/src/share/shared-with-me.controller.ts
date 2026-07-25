import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { ShareService } from './share.service';
import { PublicListQuery } from './dto';

/**
 * Nhóm C (mục 12.E) — NGƯỜI NHẬN truy cập thứ được chia sẻ trực tiếp (kênh A).
 *
 * Cố tình KHÔNG nhét vào `DownloadController`: controller đó dựng trên
 * `assertOwned()` (chỉ chủ sở hữu). Trộn 2 mô hình quyền vào một chỗ là cách
 * nhanh nhất để hở quyền khi sửa về sau (mục 12.E).
 */
@Controller('shared')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 200, ttl: 60_000 } })
export class SharedWithMeController {
  constructor(
    private readonly shares: ShareService,
    private readonly storage: StorageService,
  ) {}

  /** View "Được chia sẻ với tôi". */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.shares.listSharedWithMe(userId);
  }

  /** Duyệt cây con của 1 thư mục được chia sẻ (verify hậu duệ ở service). */
  @Get(':shareId/list')
  browse(
    @CurrentUser('id') userId: string,
    @Param('shareId') shareId: string,
    @Query() q: PublicListQuery,
  ) {
    return this.shares.browseSharedFolder(userId, shareId, q.folderId);
  }

  /** URL xem trực tuyến — presigned ngắn hạn, không lộ URL public (mục 12.B). */
  @Get('file/:fileId/content')
  async content(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ url: string }> {
    const { file, share } = await this.shares.assertGrantedAccess(
      userId,
      fileId,
    );
    const url = await this.storage.presignDownload(
      file.r2Key,
      this.shares.contentTtl(),
    );
    if (share) void this.shares.bumpCounter(share.id, 'view');
    return { url };
  }

  /** URL tải xuống — 403 nếu chia sẻ ở chế độ chỉ-xem. */
  @Get('file/:fileId/download')
  async download(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ url: string }> {
    const { file, share } = await this.shares.assertGrantedAccess(
      userId,
      fileId,
    );
    this.shares.assertDownloadAllowed(share);
    const url = await this.storage.presignDownload(
      file.r2Key,
      this.shares.contentTtl(),
      file.name,
      'attachment',
    );
    if (share) void this.shares.bumpCounter(share.id, 'download');
    return { url };
  }

  /** Bytes gốc qua backend — cho renderer DOCX/XLSX cần fetch() (mục 11.I). */
  @Get('file/:fileId/blob')
  async blob(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { file } = await this.shares.assertGrantedAccess(userId, fileId);
    const stream = await this.storage.getObjectStream(file.r2Key);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.name)}"`,
    );
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /** Văn bản đã trích xuất — preview dự phòng cho loại chưa có renderer. */
  @Get('file/:fileId/text')
  async text(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ text: string }> {
    const { file } = await this.shares.assertGrantedAccess(userId, fileId);
    try {
      const buf = await this.storage.getObjectBuffer(
        this.storage.artifactKey(file.userId, file.id),
      );
      return { text: buf.toString('utf-8') };
    } catch {
      throw new NotFoundException('Chưa có bản trích xuất văn bản cho tệp này');
    }
  }
}
