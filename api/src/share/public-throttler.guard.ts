import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limit cho route CÔNG KHAI (mục 12.D) — khoá theo IP vì không có user id.
 *
 * KHÁC `UserThrottlerGuard`: cố tình KHÔNG override `shouldSkip`, nên guard này
 * luôn bật kể cả khi biến môi trường `RATE_LIMIT` đang tắt. Route ẩn danh mà
 * không giới hạn thì bị brute-force token/mật khẩu.
 */
@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: { ip?: string }): Promise<string> {
    return Promise.resolve(req.ip ?? 'anonymous');
  }
}
