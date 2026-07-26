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
  // Danh sách origin được phép — WEB_ORIGIN có thể liệt kê nhiều origin ngăn cách
  // bằng dấu phẩy (VD "https://storage.binhh.id.vn,http://localhost:4200"), nhờ vậy
  // MỘT API đã deploy phục vụ được cả web prod lẫn web chạy local.
  const allowedOrigins = config.get<string[]>('webOrigins', []);
  // Localhost luôn được phép để dev không phải sửa env mỗi lần đổi cổng. CORS không
  // phải hàng rào bảo mật của API này (mọi route đều cần JWT Supabase) — nó chỉ
  // quyết định trình duyệt có cho JS đọc response hay không.
  const isLocalhost = (origin: string): boolean =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Không có Origin = request không phải từ trình duyệt (curl/Postman/server-to-server).
      if (!origin || allowedOrigins.includes(origin) || isLocalhost(origin)) {
        // Trả về true ⇒ cors echo lại đúng origin của request vào
        // Access-Control-Allow-Origin (không phải 1 giá trị cố định).
        callback(null, true);
      } else {
        const allowed = allowedOrigins.join(', ');
        console.warn(`CORS chặn origin: ${origin} (cho phép: ${allowed})`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
  // Chunk upload đi QUA backend (proxy) để tránh phụ thuộc CORS của GCS (mục 5.A).
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
  // Cloud Run tự set PORT (8080) và gọi container qua 0.0.0.0, KHÔNG qua
  // localhost. Bind tường minh thay vì dựa mặc định của Nest, và log ra cổng
  // thật — khi startup probe báo "failed to listen on port 8080" thì dòng log
  // này cho biết ngay app đang nghe cổng nào (thủ phạm thường là biến PORT
  // trong .env ghi đè giá trị Cloud Run cấp).
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API lắng nghe 0.0.0.0:${port} — prefix /api`);
}
void bootstrap();
