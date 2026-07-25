/**
 * Cấu hình tập trung, đọc từ biến môi trường (xem .env.example).
 * Truy cập qua ConfigService: configService.get('gcs.bucket')...
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
    // Redis managed qua internet (Upstash, Redis Cloud, Memorystore có TLS)
    // bắt buộc mã hoá; Redis local trong docker-compose thì không.
    tls: process.env.REDIS_TLS === 'true',
  },

  // Google Cloud Storage, gọi qua XML API tương thích S3 (Interoperability).
  gcs: {
    projectId: process.env.GCS_PROJECT_ID ?? '',
    bucket: process.env.GCS_BUCKET ?? 'storage-app',
    // Location của bucket dùng làm region khi ký SigV4 (VD multi-region 'asia').
    region: process.env.GCS_REGION ?? 'auto',
    endpoint: process.env.GCS_ENDPOINT ?? 'https://storage.googleapis.com',
    // HMAC key của service account (Cloud Storage -> Settings -> Interoperability).
    accessKeyId: process.env.GCS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.GCS_SECRET_ACCESS_KEY ?? '',
    // Chỉ đặt khi bucket cho phép truy cập công khai (mặc định để trống).
    publicBaseUrl: process.env.GCS_PUBLIC_BASE_URL ?? '',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    embedModel: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
    ocrModel: process.env.GEMINI_OCR_MODEL ?? 'gemini-3.6-flash',
  },

  limits: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '2048', 10),
    uploadChunkSizeMb: parseInt(process.env.UPLOAD_CHUNK_SIZE_MB ?? '8', 10),
  },

  trash: {
    // Số ngày giữ trong Thùng rác trước khi xoá vĩnh viễn (mục 7.E/11.K).
    retentionDays: parseInt(process.env.TRASH_RETENTION_DAYS ?? '30', 10),
  },

  share: {
    // Gốc URL để dựng link chia sẻ đầy đủ trả về dialog (mục 12.G).
    baseUrl:
      process.env.SHARE_BASE_URL ??
      process.env.WEB_ORIGIN ??
      'http://localhost:4200',
    // Ký token phiên sau khi mở khoá mật khẩu link (mục 12.E).
    sessionSecret: process.env.SHARE_SESSION_SECRET ?? '',
    // TTL presigned cho link công khai — thu hồi có hiệu lực trong khoảng này (mục 12.B).
    contentTtlSeconds: parseInt(
      process.env.SHARE_CONTENT_TTL_SECONDS ?? '600',
      10,
    ),
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
