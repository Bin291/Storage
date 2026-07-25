import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt.strategy';
import { ShareService } from './share.service';
import {
  CreateLinkDto,
  InviteDto,
  ListSharesQuery,
  UpdateShareDto,
} from './dto';

/**
 * Nhóm A (mục 12.E) — CHỦ SỞ HỮU quản lý quyền chia sẻ của mình.
 * Nhóm "duyệt": 100 request/phút/user (mục 5.D).
 */
@Controller('shares')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class ShareController {
  constructor(private readonly shares: ShareService) {}

  /** Tạo link công khai — kênh B. */
  @Post('link')
  createLink(@CurrentUser('id') userId: string, @Body() dto: CreateLinkDto) {
    return this.shares.createLink(userId, dto);
  }

  /** Mời theo email — kênh A (tạo Share + Notification trong 1 transaction). */
  @Post('invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteDto) {
    return this.shares.invite(user.id, user.email, dto);
  }

  /** Mọi quyền đang cấp cho 1 target (link + người được mời). */
  @Get()
  list(@CurrentUser('id') userId: string, @Query() q: ListSharesQuery) {
    return this.shares.listForTarget(userId, q.fileId, q.folderId);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.shares.update(userId, id, dto);
  }

  /** Thu hồi — dùng chung cho cả 2 kênh (xoá hẳn row, mục 12.C). */
  @Delete(':id')
  revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.shares.revoke(userId, id);
  }
}
