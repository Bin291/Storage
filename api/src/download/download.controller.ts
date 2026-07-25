import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DownloadService } from './download.service';
import { BulkZipDto } from './dto';

// Nhóm "download": 200 request/phút/user (mục 5.D) — duyệt grid gọi dồn dập.
@Controller('downloads')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 200, ttl: 60_000 } })
export class DownloadController {
  constructor(private readonly download: DownloadService) {}

  /** URL tải/preview 1 file (CDN hoặc presigned GET, hỗ trợ Range — video/audio/ảnh/PDF). */
  @Get('file/:fileId')
  fileUrl(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.download.fileUrl(userId, fileId);
  }

  /** URL tải xuống thật — attachment + đúng tên gốc, kể cả tiếng Việt có dấu (mục 11.J). */
  @Get('file/:fileId/download')
  downloadUrl(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.download.downloadUrl(userId, fileId);
  }

  /** Bytes gốc QUA backend — dùng cho renderer DOCX/XLSX cần fetch() (mục 11.I). */
  @Get('file/:fileId/blob')
  async fileBlob(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, mimeType, name } = await this.download.fileBlob(userId, fileId);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /** Văn bản đã trích xuất sẵn — preview dự phòng cho loại tài liệu chưa có renderer. */
  @Get('file/:fileId/text')
  fileText(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.download.fileText(userId, fileId);
  }

  /** Bắt đầu nén folder (bất đồng bộ) — trả jobId để poll. */
  @Post('folder/:folderId/zip')
  startZip(
    @CurrentUser('id') userId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.download.startFolderZip(userId, folderId);
  }

  /** Bắt đầu nén nhiều mục đã chọn (mục 11.J — bulk download kiểu Drive), trả jobId để poll. */
  @Post('bulk-zip')
  startBulkZip(
    @CurrentUser('id') userId: string,
    @Body() dto: BulkZipDto,
  ) {
    return this.download.startBulkZip(userId, dto.fileIds, dto.folderIds);
  }

  @Get('zip/:jobId')
  zipStatus(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.download.zipStatus(userId, jobId);
  }
}
