import { Injectable, signal } from '@angular/core';

/**
 * Nơi kéo-thả sẽ tải file vào (mục 11.H) — cập nhật bởi trang Files đang mở
 * (folder hiện tại ở lăng kính Thư mục), mặc định null = gốc "My Storage" ở
 * mọi trang khác. Đọc bởi Shell — nơi thực sự bắt sự kiện kéo-thả TOÀN màn
 * hình, vì vùng nhận kéo-thả không còn giới hạn trong 1 div nội dung nữa.
 */
@Injectable({ providedIn: 'root' })
export class DropTargetService {
  readonly folderId = signal<string | null>(null);
}
