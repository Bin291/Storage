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
