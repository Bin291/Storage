/**
 * Nhóm loại file suy ra từ extension (mục 11.A) — dùng cho filter.
 * Đồng bộ với mapping hiển thị phía Angular.
 */
export const FILE_CATEGORIES: Record<string, string[]> = {
  document: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'],
  spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
  presentation: ['ppt', 'pptx', 'odp'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
  code: ['js', 'ts', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'json', 'html', 'css'],
};

export function extensionsForCategory(category: string): string[] | null {
  return FILE_CATEGORIES[category] ?? null;
}
