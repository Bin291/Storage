// Mapping "extension → nhóm" (mục 11.H) — 7 nhóm cân bằng, TĨNH ở client.
// Không lưu DB: suy trực tiếp từ File.extension. Đuôi lạ rơi vào "Khác".
// Mở rộng nhóm chỉ cần sửa bảng này, KHÔNG đụng backend/schema.

export type GroupId =
  | 'document'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'archive'
  | 'other';

export interface FileGroupDef {
  id: GroupId;
  label: string;
  /** Tên ligature Google Material Symbols (render qua <span class="mi">). */
  icon: string;
  /** Đuôi đại diện (mở rộng dần). 'other' = bucket fallback, để rỗng. */
  extensions: string[];
}

export const FILE_GROUPS: FileGroupDef[] = [
  {
    id: 'document',
    label: 'Tài liệu',
    icon: 'description',
    // Gộp cả bảng tính + trình chiếu (lựa chọn "7 nhóm cân bằng" — mục 11.H).
    extensions: [
      'pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'epub',
      'xls', 'xlsx', 'csv', 'ods', 'ppt', 'pptx', 'odp',
    ],
  },
  {
    id: 'image',
    label: 'Ảnh',
    icon: 'image',
    extensions: [
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'ico', 'avif',
    ],
  },
  {
    id: 'video',
    label: 'Video',
    icon: 'movie',
    extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'm4v', 'mpeg', '3gp'],
  },
  {
    id: 'audio',
    label: 'Âm thanh',
    icon: 'music_note',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
  },
  {
    id: 'code',
    label: 'Code',
    icon: 'code',
    extensions: [
      'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs',
      'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'sh',
      'sql', 'vue', 'kt', 'swift',
    ],
  },
  {
    id: 'archive',
    label: 'Nén',
    icon: 'folder_zip',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'],
  },
  { id: 'other', label: 'Khác', icon: 'attach_file', extensions: [] },
];

const KNOWN = new Set<string>(
  FILE_GROUPS.flatMap((g) => g.extensions),
);

const BY_ID = new Map<GroupId, FileGroupDef>(
  FILE_GROUPS.map((g) => [g.id, g]),
);

export function groupById(id: string): FileGroupDef | undefined {
  return BY_ID.get(id as GroupId);
}

/** Nhóm chứa 1 đuôi file (đuôi lạ -> 'other'). */
export function groupForExtension(ext: string): GroupId {
  const e = (ext || '').toLowerCase();
  for (const g of FILE_GROUPS) {
    if (g.extensions.includes(e)) return g.id;
  }
  return 'other';
}

/** Đuôi đã biết? (để dựng danh sách "extensions" cho lăng kính "Khác"). */
export function isKnownExtension(ext: string): boolean {
  return KNOWN.has((ext || '').toLowerCase());
}
