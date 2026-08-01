import { BreadcrumbNode } from '../models/common.model';

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
