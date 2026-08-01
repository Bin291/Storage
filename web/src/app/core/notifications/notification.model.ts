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
