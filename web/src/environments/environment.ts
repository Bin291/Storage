// Cấu hình runtime frontend. Các giá trị Supabase ở đây là PUBLIC (anon key an toàn để lộ).
// Điền giá trị thật từ Supabase Project Settings -> API.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  supabaseUrl: 'https://zniettadfyvqglzlrwew.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuaWV0dGFkZnl2cWdsemxyd2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODkyMTMsImV4cCI6MjA5OTc2NTIxM30.ERixeb4jqTQxw8qnEY61w-a3AcOIY9OybN_Mctju50c',
  // Kích thước chunk upload (byte) — khớp UPLOAD_CHUNK_SIZE_MB backend (mục 5.A).
  uploadChunkSize: 8 * 1024 * 1024,
  // Số chunk đẩy song song (mục 5.A).
  uploadConcurrency: 4,
};
