import { groupForExtension } from './file-groups';
import { isPreviewableImage } from './file-utils';

/**
 * Loại renderer xem trước theo đuôi file (mục 11.I — hoàn thiện MVP phụ).
 * - image/pdf/audio/video: phát trực tiếp qua URL R2 (Range Requests sẵn có).
 * - docx: render qua thư viện `docx-preview` (client-side, cần bytes gốc).
 * - sheet: xlsx/xls/csv/ods render qua SheetJS thành bảng HTML.
 * - text-raw: txt/md — tệp đã là văn bản, đọc thẳng bytes gốc.
 * - text-extract: pptx/ppt/odt/odp/rtf/epub — CHƯA có renderer trực quan,
 *   dùng lại văn bản AI đã trích xuất sẵn (mục 8.C) làm bản xem trước dự phòng.
 * - other: không xem trước được (nén, thực thi, ...) — chỉ tải xuống.
 */
export type PreviewKind =
  | 'image'
  | 'pdf'
  | 'docx'
  | 'sheet'
  | 'audio'
  | 'video'
  | 'text-raw'
  | 'text-extract'
  | 'other';

const SHEET_EXTS = new Set(['xlsx', 'xls', 'csv', 'ods']);
const TEXT_RAW_EXTS = new Set(['txt', 'md']);
// .doc (nhị phân cũ) KHÔNG được docx-preview hỗ trợ (chỉ đọc OOXML .docx) -> rơi vào text-extract.
const TEXT_EXTRACT_EXTS = new Set(['doc', 'ppt', 'pptx', 'odt', 'odp', 'rtf', 'epub']);

export function previewKindForExtension(ext: string): PreviewKind {
  const e = (ext || '').toLowerCase();
  if (isPreviewableImage(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (SHEET_EXTS.has(e)) return 'sheet';
  if (groupForExtension(e) === 'video') return 'video';
  if (groupForExtension(e) === 'audio') return 'audio';
  if (TEXT_RAW_EXTS.has(e)) return 'text-raw';
  if (TEXT_EXTRACT_EXTS.has(e)) return 'text-extract';
  return 'other';
}

/** Kind nào mở được modal xem trước toàn màn hình (nút "Bấm để xem"/dblclick). */
export function isPreviewKindOpenable(kind: PreviewKind): boolean {
  return kind !== 'other';
}

/** Kind nào có thể render TRỰC TIẾP gọn trong panel chi tiết hẹp (320px). */
export function isPreviewKindInline(kind: PreviewKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video';
}

/** Kind nào backend có sinh ảnh thumbnail (mục 7.C/11.I) — khớp `ThumbnailService.supports()`. */
export function isThumbnailCapable(kind: PreviewKind): boolean {
  return (
    kind === 'image' ||
    kind === 'pdf' ||
    kind === 'docx' ||
    kind === 'sheet' ||
    kind === 'audio' ||
    kind === 'video'
  );
}
