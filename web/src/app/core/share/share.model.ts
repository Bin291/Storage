import { FileItem } from '../files/file.model';

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
