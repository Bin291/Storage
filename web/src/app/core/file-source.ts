/**
 * Nguồn nội dung của 1 tệp, tách khỏi "đường lấy nội dung" (mục 12.F).
 *
 * Cùng một bộ renderer xem trước (`shared/preview/*`) phải chạy được ở 3 ngữ
 * cảnh quyền khác nhau:
 *   - chủ sở hữu       -> /downloads/file/:id/*   (assertOwned ở backend)
 *   - được chia sẻ     -> /shared/file/:id/*      (assertGrantedAccess)
 *   - link công khai   -> /s/:token/*             (resolveShare)
 *
 * Nếu để renderer tự gọi `api.fileBlob(fileId)` như trước thì mỗi ngữ cảnh
 * phải nhân bản toàn bộ renderer. Trừu tượng này khiến renderer chỉ biết
 * "lấy bytes/text/URL ở đâu đó", không biết gì về quyền.
 */
export interface FileSource {
  /** Bytes gốc — cho renderer cần đọc trực tiếp (DOCX/XLSX/text thô). */
  blob(): Promise<Blob>;
  /** Văn bản AI đã trích xuất sẵn — bản xem trước dự phòng. */
  text(): Promise<string>;
  /** URL xem trực tuyến (ảnh/PDF/audio/video — hỗ trợ Range). */
  contentUrl(): Promise<string>;
  /** URL tải xuống thật (attachment + đúng tên gốc). */
  downloadUrl(): Promise<string>;
}
