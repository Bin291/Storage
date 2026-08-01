// Tiện ích hiển thị file: icon theo extension (Material Symbols — mục 11.H) + format dung lượng/ngày.
import { groupById, groupForExtension } from './file-groups';

// Vài đuôi có icon Material đặc thù hơn icon nhóm chung (rõ nghĩa hơn khi hiện to trên card).
const EXT_ICON_OVERRIDES: Record<string, string> = {
  pdf: 'picture_as_pdf',
  xls: 'table_chart', xlsx: 'table_chart', csv: 'table_chart', ods: 'table_chart',
  ppt: 'slideshow', pptx: 'slideshow', odp: 'slideshow',
};

/** Tên ligature Material Symbols cho 1 đuôi file — dùng trong <span class="mi">. */
export function iconForExtension(ext: string): string {
  const e = (ext || '').toLowerCase();
  if (EXT_ICON_OVERRIDES[e]) return EXT_ICON_OVERRIDES[e];
  return groupById(groupForExtension(e))?.icon ?? 'draft';
}

export function isPreviewableImage(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext?.toLowerCase());
}

export function formatSize(bytes: string | number): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const val = n / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
