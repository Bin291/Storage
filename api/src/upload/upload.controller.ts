import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadService } from './upload.service';
import {
  CompleteUploadDto,
  InitUploadDto,
  PartUrlsDto,
  UploadIdDto,
} from './dto';

// Nhóm "upload session": 30 request/phút/user (mục 5.D).
// Data chunk đi THẲNG lên GCS nên mỗi file chỉ tốn vài request tới backend.
@Controller('uploads')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  @Post('init')
  init(@CurrentUser('id') userId: string, @Body() dto: InitUploadDto) {
    return this.upload.init(userId, {
      name: dto.name,
      extension: dto.extension,
      mimeType: dto.mimeType,
      size: dto.size,
      folderId: dto.folderId ?? null,
    });
  }

  @Post(':fileId/part-urls')
  partUrls(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Body() dto: PartUrlsDto,
  ) {
    return this.upload.partUrls(userId, fileId, dto.uploadId, dto.partNumbers);
  }

  // Nhận bytes 1 part (application/octet-stream) rồi đẩy lên GCS — tránh CORS GCS.
  // Nới throttle vì file lớn có nhiều part (mỗi part = 1 request tới backend).
  @Post(':fileId/part')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  uploadPart(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Query('uploadId') uploadId: string,
    @Query('partNumber') partNumber: string,
    @Req() req: Request,
  ) {
    return this.upload.uploadPart(
      userId,
      fileId,
      uploadId,
      Number(partNumber),
      req.body as Buffer,
    );
  }

  @Post(':fileId/list-parts')
  listParts(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Body() dto: UploadIdDto,
  ) {
    return this.upload.listParts(userId, fileId, dto.uploadId);
  }

  @Post(':fileId/complete')
  complete(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.upload.complete(userId, fileId, dto.uploadId, dto.parts);
  }

  @Post(':fileId/abort')
  async abort(
    @CurrentUser('id') userId: string,
    @Param('fileId') fileId: string,
    @Body() dto: UploadIdDto,
  ) {
    await this.upload.abort(userId, fileId, dto.uploadId);
    return { status: 'aborted' };
  }
}
