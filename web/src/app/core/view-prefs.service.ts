import { Injectable, effect, signal } from '@angular/core';
import { SortField, SortOrder } from './models';

export type ViewMode = 'grid' | 'list';
export type Density = 'comfortable' | 'compact';

/** Lưu tuỳ chọn hiển thị + cá nhân hoá ở localStorage — không có bảng DB (mục 11.D/11.G). */
@Injectable({ providedIn: 'root' })
export class ViewPrefsService {
  private readonly modeKey = 'storage-app.viewMode';
  private readonly densityKey = 'storage-app.density';
  private readonly sortKey = 'storage-app.defaultSort';
  private readonly orderKey = 'storage-app.defaultOrder';
  private readonly notifyKey = 'storage-app.notifyDone';
  private readonly mobileNamesKey = 'storage-app.mobileTileNames';

  readonly mode = signal<ViewMode>(
    (localStorage.getItem(this.modeKey) as ViewMode) || 'grid',
  );
  readonly density = signal<Density>(
    (localStorage.getItem(this.densityKey) as Density) || 'comfortable',
  );
  readonly defaultSort = signal<SortField>(
    (localStorage.getItem(this.sortKey) as SortField) || 'updatedAt',
  );
  readonly defaultOrder = signal<SortOrder>(
    (localStorage.getItem(this.orderKey) as SortOrder) || 'desc',
  );
  /** Bật thông báo trình duyệt khi file xử lý xong (mục 11.F). */
  readonly notifyOnDone = signal<boolean>(
    localStorage.getItem(this.notifyKey) !== 'false',
  );
  /**
   * Hiện tên TỆP dưới mỗi ô ở chế độ Lưới khi màn hình nhỏ (điện thoại/tablet).
   * Mặc định **tắt**: ảnh xem trước đã đủ để nhận ra tệp, còn tên 2 dòng làm ô
   * cao gấp rưỡi và trang trông rối (phản hồi UI). Tên **thư mục** không chịu
   * ảnh hưởng của tuỳ chọn này — thư mục không có ảnh xem trước nên luôn cần tên.
   * Chế độ Danh sách cũng không ảnh hưởng — luôn có cột tên.
   */
  readonly mobileTileNames = signal<boolean>(
    localStorage.getItem(this.mobileNamesKey) === 'true',
  );

  constructor() {
    effect(() => localStorage.setItem(this.modeKey, this.mode()));
    effect(() => localStorage.setItem(this.densityKey, this.density()));
    effect(() => localStorage.setItem(this.sortKey, this.defaultSort()));
    effect(() => localStorage.setItem(this.orderKey, this.defaultOrder()));
    effect(() =>
      localStorage.setItem(this.notifyKey, String(this.notifyOnDone())),
    );
    effect(() =>
      localStorage.setItem(this.mobileNamesKey, String(this.mobileTileNames())),
    );
  }

  toggleMode(): void {
    this.mode.set(this.mode() === 'grid' ? 'list' : 'grid');
  }
}
