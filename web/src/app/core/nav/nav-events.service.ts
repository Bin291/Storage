import { Injectable, signal } from '@angular/core';

/**
 * Bus nhỏ để trang Files báo sidebar toàn cục (nav-sidebar) reload cây thư mục
 * sau khi tạo/đổi tên/chuyển/xoá folder — vì sidebar không còn nằm trong Files.
 */
@Injectable({ providedIn: 'root' })
export class NavEventsService {
  /** Bump mỗi khi cấu trúc folder thay đổi. */
  readonly foldersChanged = signal(0);

  bumpFolders(): void {
    this.foldersChanged.update((n) => n + 1);
  }
}
