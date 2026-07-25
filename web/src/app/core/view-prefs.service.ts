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

  constructor() {
    effect(() => localStorage.setItem(this.modeKey, this.mode()));
    effect(() => localStorage.setItem(this.densityKey, this.density()));
    effect(() => localStorage.setItem(this.sortKey, this.defaultSort()));
    effect(() => localStorage.setItem(this.orderKey, this.defaultOrder()));
    effect(() =>
      localStorage.setItem(this.notifyKey, String(this.notifyOnDone())),
    );
  }

  toggleMode(): void {
    this.mode.set(this.mode() === 'grid' ? 'list' : 'grid');
  }
}
