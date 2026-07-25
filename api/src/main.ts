import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module';

// File.size là BigInt (mục 7.B) — JSON.stringify không serialize BigInt mặc định.
// Patch để trả về dạng string trong response (Angular tự parse khi cần).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('webOrigin'),
    credentials: true,
  });
  // Chunk upload đi QUA backend (proxy) để tránh phụ thuộc CORS của R2 (mục 5.A).
  // Nhận body nhị phân application/octet-stream cho route /api/uploads/**.
  // Chỉ khớp octet-stream nên body JSON (init/complete) vẫn qua parser mặc định.
  const chunkMb = config.get<number>('limits.uploadChunkSizeMb', 8);
  app.use('/api/uploads', raw({ type: 'application/octet-stream', limit: `${chunkMb + 8}mb` }));
  // Ảnh đại diện (mục 11.E): ảnh gốc trước khi resize có thể vài MB.
  app.use('/api/me/avatar', raw({ type: 'application/octet-stream', limit: '10mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API chạy tại http://localhost:${port}/api`);
}
void bootstrap();
