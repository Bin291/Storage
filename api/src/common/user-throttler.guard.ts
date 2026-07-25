import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../auth/jwt.strategy';

/**
 * Rate limit khoá theo user id (mục 5.D), không theo IP — app bắt buộc đăng nhập.
 * Phải đặt SAU JwtAuthGuard trong @UseGuards để req.user đã tồn tại.
 *
 * HIỆN TẮT theo yêu cầu ("không giới hạn request, tính sau"): mặc định bỏ qua
 * throttle cho mọi route. Bật lại bằng biến môi trường RATE_LIMIT=on.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: { user?: AuthUser; ip?: string }): Promise<string> {
    return Promise.resolve(req.user?.id ?? req.ip ?? 'anonymous');
  }

  protected shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(process.env.RATE_LIMIT !== 'on');
  }
}
