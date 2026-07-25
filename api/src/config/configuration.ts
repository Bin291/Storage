/**
 * Cấu hình tập trung, đọc từ biến môi trường (xem .env.example).
 * Truy cập qua ConfigService: configService.get('r2.bucket')...
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },

  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.R2_BUCKET ?? 'storage-app',
    endpoint: process.env.R2_ENDPOINT ?? '',
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? '',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    embedModel: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
    ocrModel: process.env.GEMINI_OCR_MODEL ?? 'gemini-2.5-flash',
  },

  limits: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '2048', 10),
    uploadChunkSizeMb: parseInt(process.env.UPLOAD_CHUNK_SIZE_MB ?? '8', 10),
  },

  trash: {
    // Số ngày giữ trong Thùng rác trước khi xoá vĩnh viễn (mục 7.E/11.K).
    retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS ?? '30', 10),
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
