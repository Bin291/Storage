-- ============================================================
--  Chạy MỘT LẦN trong Supabase SQL Editor sau khi `prisma migrate`.
--  (Prisma quản lý bảng; các thứ dưới đây Prisma không tạo được.)
-- ============================================================

-- 1) Bật pgvector (mục 3). Migration của Prisma đã tạo extension nếu bật
--    previewFeatures postgresqlExtensions, nhưng để chắc chắn:
create extension if not exists vector;

-- 2) RPC semantic search — LUÔN filter user_id (mục 8.C).
--    top-K = 10, không áp ngưỡng similarity cứng (hiển thị % cho người dùng).
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  match_count int default 10
)
returns table (
  file_id text, -- File.id là Prisma String => cột kiểu text (KHÔNG phải uuid)
  file_name text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    f.id as file_id,
    f.name as file_name,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from "DocumentChunk" dc
  join "File" f on f.id = dc."fileId"
  -- File."userId" là text (Prisma String); cast uuid -> text để so khớp.
  where f."userId" = match_user_id::text
    and f.status = 'ready'
    and f."deletedAt" is null -- loại file đang ở Thùng rác khỏi kết quả AI search (mục 7.E/11.K)
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- 3) Realtime: thêm bảng File vào publication để Angular nhận cập nhật
--    thumbnailUrl / status live (mục 7.A). Bọc DO block để chạy lại an toàn
--    (ALTER PUBLICATION ... ADD TABLE không có "IF NOT EXISTS").
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'File'
  ) then
    alter publication supabase_realtime add table "File";
  end if;
end $$;

-- 3b) Bảo mật Realtime bằng RLS SELECT-only.
--    Prisma kết nối service-role => BỎ QUA RLS hoàn toàn, nên app logic không đổi
--    (vẫn tự lọc WHERE userId ở tầng NestJS — mục 3). RLS ở đây CHỈ để Realtime
--    (client dùng anon/authenticated JWT) không cho user này nghe thay đổi của user khác.
grant select on "File" to authenticated;
alter table "File" enable row level security;
drop policy if exists "realtime_own_files" on "File";
create policy "realtime_own_files" on "File"
  for select to authenticated
  using ("userId" = auth.uid()::text);

-- Ghi chú: chưa tạo index ivfflat/hnsw cho pgvector ở giai đoạn MVP (mục 8.C).
-- Thêm khi search bắt đầu chậm rõ rệt:
--   create index on "DocumentChunk" using hnsw (embedding vector_cosine_ops);
