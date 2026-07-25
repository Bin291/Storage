import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { ShareService } from './share.service';
import { PublicListQuery, UnlockDto } from './dto';
import { PublicThrottlerGuard } from './public-throttler.guard';

/** Header mang token phiên sau khi mở khoá mật khẩu (mục 12.E). */
const SESSION_HEADER = 'x-share-session';

/**
 * Nhóm B (mục 12.E) — truy cập CÔNG KHAI bằng token, KHÔNG đăng nhập.
 *
 * Controller này cố tình KHÔNG gắn `JwtAuthGuard` (mọi controller khác đều có).
 * Bù lại bắt buộc `PublicThrottlerGuard` — throttle theo IP, luôn bật kể cả
 * khi `RATE_LIMIT` tắt, vì đây là bề mặt ẩn danh duy nhất của API.
 */
@Controller('s')
@UseGuards(PublicThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicShareController {
  constructor(
    private readonly shares: ShareService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Metadata dựng trang. Nếu link có mật khẩu mà chưa mở khoá thì CHỈ trả
   * `requiresPassword` — không lộ cả tên tệp (mục 12.E).
   */
  @Get(':token')
  async meta(
    @Param('token') token: string,
    @Headers(SESSION_HEADER) session?: string,
  ) {
    try {
      const { share, file, folder } = await this.shares.resolveShare(
        token,
        session,
      );
      return {
        requiresPassword: false,
        kind: file ? 'file' : 'folder',
        id: file?.id ?? folder!.id,
        name: file?.name ?? folder!.name,
        extension: file?.extension ?? null,
        mimeType: file?.mimeType ?? null,
        size: file ? file.size.toString() : null,
        allowDownload: share.allowDownload,
      };
    } catch (err) {
      if ((err as { message?: string }).message === 'PASSWORD_REQUIRED') {
        return { requiresPassword: true };
      }
      throw err;
    }
  }

  /** Đổi mật khẩu lấy token phiên. Siết chặt hơn: 10 lần/phút/IP (mục 12.D). */
  @Post(':token/unlock')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  unlock(@Param('token') token: string, @Body() dto: UnlockDto) {
    return this.shares.unlock(token, dto.password);
  }

  /** Duyệt cây con của link folder — verify hậu duệ ở service (mục 12.D). */
  @Get(':token/list')
  async list(
    @Param('token') token: string,
    @Query() q: PublicListQuery,
    @Headers(SESSION_HEADER) session?: string,
  ) {
    const resolved = await this.shares.resolveShare(token, session);
    return this.shares.publicBrowse(resolved, q.folderId);
  }

  /** URL xem trực tuyến — presigned TTL ngắn, KHÔNG bao giờ là URL public của bucket. */
  @Get(':token/content')
  async content(
    @Param('token') token: string,
    @Query('fileId') fileId?: string,
    @Headers(SESSION_HEADER) session?: string,
  ): Promise<{ url: string }> {
    const resolved = await this.shares.resolveShare(token, session);
    const file = await this.shares.publicFileWithin(
      resolved,
      fileId ?? resolved.file?.id ?? '',
    );
    const url = await this.storage.presignDownload(
      file.r2Key,
      this.shares.contentTtl(),
    );
    void this.shares.bumpCounter(resolved.share.id, 'view');
    return { url };
  }

  @Get(':token/download')
  async download(
    @Param('token') token: string,
    @Query('fileId') fileId?: string,
    @Headers(SESSION_HEADER) session?: string,
  ): Promise<{ url: string }> {
    const resolved = await this.shares.resolveShare(token, session);
    this.shares.assertDownloadAllowed(resolved.share);
    const file = await this.shares.publicFileWithin(
      resolved,
      fileId ?? resolved.file?.id ?? '',
    );
    const url = await this.storage.presignDownload(
      file.r2Key,
      this.shares.contentTtl(),
      file.name,
      'attachment',
    );
    void this.shares.bumpCounter(resolved.share.id, 'download');
    return { url };
  }

  /** Bytes gốc qua backend — cho renderer DOCX/XLSX cần fetch() (mục 11.I). */
  @Get(':token/blob')
  async blob(
    @Param('token') token: string,
    @Res() res: Response,
    @Query('fileId') fileId?: string,
    @Headers(SESSION_HEADER) session?: string,
  ): Promise<void> {
    const resolved = await this.shares.resolveShare(token, session);
    const file = await this.shares.publicFileWithin(
      resolved,
      fileId ?? resolved.file?.id ?? '',
    );
    const stream = await this.storage.getObjectStream(file.r2Key);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.name)}"`,
    );
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /** Văn bản đã trích xuất — preview dự phòng. */
  @Get(':token/text')
  async text(
    @Param('token') token: string,
    @Query('fileId') fileId?: string,
    @Headers(SESSION_HEADER) session?: string,
  ): Promise<{ text: string }> {
    const resolved = await this.shares.resolveShare(token, session);
    const file = await this.shares.publicFileWithin(
      resolved,
      fileId ?? resolved.file?.id ?? '',
    );
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
