// Cấu hình runtime frontend. Các giá trị Supabase ở đây là PUBLIC (anon key an toàn để lộ).
// Điền giá trị thật từ Supabase Project Settings -> API.
export const environment = {
  production: false,
  // Bắt buộc có đuôi /api — main.ts gọi app.setGlobalPrefix('api').
  apiBaseUrl: 'http://localhost:3000/api',
  supabaseUrl: 'https://wvwrrkymwyvgsvbuzmep.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2d3Jya3ltd3l2Z3N2YnV6bWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NTAxNzMsImV4cCI6MjEwMDUyNjE3M30.sDE5PmQ5bMFVuzqqQyccm2BY8yV7eS4zihAobGnw7N4',
  // Kích thước chunk upload (byte) — khớp UPLOAD_CHUNK_SIZE_MB backend (mục 5.A).
  uploadChunkSize: 8 * 1024 * 1024,
  // Số chunk đẩy song song (mục 5.A).
  uploadConcurrency: 4,
};
