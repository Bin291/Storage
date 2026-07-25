import { Module } from '@nestjs/common';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';
import { SharedWithMeController } from './shared-with-me.controller';
import { PublicShareController } from './public-share.controller';

/**
 * Chia sẻ (mục 12). 3 controller tách bạch theo mô hình quyền:
 *   ShareController        — chủ sở hữu quản lý quyền (JwtAuthGuard)
 *   SharedWithMeController — người nhận đọc (JwtAuthGuard)
 *   PublicShareController  — ẩn danh bằng token (PublicThrottlerGuard, KHÔNG Jwt)
 */
@Module({
  controllers: [ShareController, SharedWithMeController, PublicShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
