export type FileStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'delete_pending';

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  thumbnailUrl: string | null;
  size: string; // BigInt serialize thành string (mục 7.B)
  folderId: string | null;
  status: FileStatus;
  errorMessage: string | null;
  isStarred: boolean;
  deletedAt: string | null; // null = active; có giá trị = trong Thùng rác (mục 7.E/11.K)
  createdAt: string;
  updatedAt: string;
  // Chỉ có ở lăng kính cắt-ngang-folder (Loại/Gần đây — mục 11.H):
  // đường dẫn từ gốc tới folder cha trực tiếp. File ở gốc -> [].
  folderPath?: BreadcrumbNode[];
}

/** 1 mục trong Thùng rác (file hoặc folder) — GET /trash (mục 11.K). */
export interface TrashItem {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  size: string | null;
  deletedAt: string;
  daysUntilPurge: number;
  folderPath: BreadcrumbNode[];
}

/** Số đếm file theo đuôi (endpoint GET /files/stats — mục 11.H). */
export interface FileStat {
  extension: string;
  count: number;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  isStarred: boolean;
  status: string;
  deletedAt: string | null; // null = active; có giá trị = trong Thùng rác (mục 7.E/11.K)
  createdAt: string;
  updatedAt: string;
}

export interface FileListResult {
  files: FileItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BreadcrumbNode {
  id: string;
  name: string;
}

export interface SearchResultItem {
  fileId: string;
  fileName: string;
  similarity: number;
  snippets: string[];
}

// --- Chia sẻ (mục 12) ---

/** 1 quyền đang cấp cho 1 target — link công khai HOẶC người được mời. */
export interface ShareView {
  id: string;
  kind: 'link' | 'invite';
  url: string | null; // chỉ có với kind = 'link'
  email: string | null; // chỉ có với kind = 'invite'
  allowDownload: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
}

/** 1 mục ở view "Được chia sẻ với tôi" (mục 12.E nhóm C). */
export interface SharedWithMeItem {
  shareId: string;
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  mimeType: string | null;
  size: string | null;
  thumbnailUrl: string | null;
  ownerEmail: string | null;
  allowDownload: boolean;
  expiresAt: string | null;
  sharedAt: string;
}

/** Kết quả duyệt cây con của 1 thư mục được chia sẻ (kênh A lẫn kênh B). */
export interface SharedBrowseResult {
  folder: { id: string; name: string };
  folders: { id: string; name: string }[];
  files: FileItem[];
}

/**
 * Metadata trang công khai `/s/:token`. Khi link có mật khẩu mà chưa mở khoá,
 * backend CHỈ trả `requiresPassword: true` — không lộ cả tên tệp (mục 12.E).
 */
export interface PublicShareMeta {
  requiresPassword: boolean;
  kind?: 'file' | 'folder';
  id?: string;
  name?: string;
  extension?: string | null;
  mimeType?: string | null;
  size?: string | null;
  allowDownload?: boolean;
}

/** Thông báo trong app (mục 12.J). */
export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  shareId: string | null;
  readAt: string | null;
  createdAt: string;
}

export type SortField = 'name' | 'updatedAt' | 'size' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ListParams {
  folderId?: string | null;
  starred?: boolean;
  category?: string | null;
  extensions?: string[] | null; // lăng kính Loại (mục 11.H)
  recent?: boolean; // lăng kính Gần đây (mục 11.H)
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}
