import { Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import sharp from 'sharp';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './jwt.strategy';
import { StorageService } from '../storage/storage.service';

@Controller('me')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
export class MeController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /**
   * URL tải avatar hiện tại (cá nhân hoá — mục 11.E). Luôn presign mới (không
   * cache): key GCS cố định theo userId nên KHÔNG cần cờ "hasAvatar" trong DB —
   * ảnh chưa từng tải lên thì presigned URL trỏ tới object không tồn tại, phía
   * Angular tự fallback về chữ cái đầu khi <img> báo lỗi tải.
   */
  @Get('avatar-url')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async avatarUrl(@CurrentUser('id') userId: string): Promise<{ url: string }> {
    const url = await this.storage.presignDownload(this.storage.avatarKey(userId));
    return { url };
  }

  /** Tải avatar mới: resize vuông 256x256 qua sharp rồi ghi đè object GCS của user. */
  @Post('avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    const buffer = await sharp(req.body as Buffer)
      .rotate() // tôn trọng EXIF orientation
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
    const key = this.storage.avatarKey(userId);
    await this.storage.putObject(key, buffer, 'image/webp');
    const url = await this.storage.presignDownload(key);
    return { url };
  }

  @Delete('avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async deleteAvatar(@CurrentUser('id') userId: string): Promise<{ status: string }> {
    await this.storage.deleteObject(this.storage.avatarKey(userId));
    return { status: 'deleted' };
  }
}
