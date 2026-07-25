import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { FoldersModule } from './folders/folders.module';
import { FilesModule } from './files/files.module';
import { UploadModule } from './upload/upload.module';
import { DownloadModule } from './download/download.module';
import { AiModule } from './ai/ai.module';
import { SearchModule } from './search/search.module';
import { TrashModule } from './trash/trash.module';
import { ShareModule } from './share/share.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Rate limiting theo user id (mục 5.D) — key resolver đặt ở guard tuỳ nhóm route.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    // BullMQ dùng chung Redis với cache (mục 5.B).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          // Giãn thời gian thử lại để không spam log khi Redis chưa chạy.
          retryStrategy: (times: number) => Math.min(times * 1000, 15_000),
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    CacheModule,
    AuthModule,
    JobsModule,
    FoldersModule,
    FilesModule,
    UploadModule,
    DownloadModule,
    AiModule,
    SearchModule,
    TrashModule,
    ShareModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
