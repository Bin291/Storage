import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Kết nối trực tiếp Postgres connection string của Supabase (mục 3 PLAN.md).
 * Không dùng RLS — mọi service tự lọc WHERE userId.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Không chặn boot nếu DB chưa cấu hình/không kết nối được — log cảnh báo,
    // request cần DB sẽ tự lỗi. Giúp `npm run start:dev` chạy được để dev UI.
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        `Không kết nối được Postgres (kiểm tra DATABASE_URL): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}
