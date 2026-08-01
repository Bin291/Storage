import { BreadcrumbNode } from '../models/common.model';

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

export interface FileListResult {
  files: FileItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type SortField = 'name' | 'updatedAt' | 'size' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ListParams {
  folderId?: string | null;
  starred?: boolean;
  category?: string | null;
  extensions?: string[] | null; // lăng kính Loại (mục 11.H)
  recent?: boolean; // lăng kính Gần đây (mục 11.H)
  q?: string; // tìm nhanh THEO TÊN (khác AI search — mục 11.M)
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}
