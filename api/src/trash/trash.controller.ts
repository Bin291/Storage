import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TrashService } from './trash.service';

// Nhóm "duyệt file/folder": 100 request/phút/user (mục 5.D).
@Controller('trash')
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  /** List trash root (file + folder) của user — mục 11.K. */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.trash.list(userId);
  }

  /** "Dọn thùng rác" — xoá vĩnh viễn toàn bộ, xử lý bất đồng bộ (mục 11.K). */
  @Post('empty')
  empty(@CurrentUser('id') userId: string) {
    return this.trash.emptyTrash(userId);
  }
}
