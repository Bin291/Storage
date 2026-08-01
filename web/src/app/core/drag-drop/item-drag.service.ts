import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { ApiService } from '../api/api.service';
import { NavEventsService } from '../nav/nav-events.service';
import { StatsService } from '../stats/stats.service';

export type DragItemKind = 'file' | 'folder';
export interface DragItem {
  kind: DragItemKind;
  id: string;
  name: string;
}

/**
 * Kiểu MIME riêng cho kéo-thả NỘI BỘ (di chuyển mục sẵn có trong app).
 * Phải khác hẳn `Files` — kiểu mà trình duyệt gắn khi người dùng kéo tệp từ máy
 * vào cửa sổ — vì `Shell` bắt kéo-thả toàn màn hình cho luồng TẢI LÊN và chỉ
 * phản ứng khi `types` có `Files`. Hai luồng nhờ vậy không giẫm chân nhau.
 */
export const ITEM_DRAG_MIME = 'application/x-storage-items';

/**
 * Kéo-thả nội bộ để **di chuyển** tệp/thư mục vào thư mục khác (mục 11.O).
 *
 * Đặt ở service dùng chung vì nguồn kéo (lưới/danh sách ở trang Files) và một
 * số đích thả (cây thư mục ở sidebar — component khác hẳn, không cùng cha)
 * không nói chuyện trực tiếp được với nhau. `DataTransfer` chỉ chuyển được
 * chuỗi và **không đọc được ở `dragover`** (bảo mật của trình duyệt), nên trạng
 * thái "đang kéo cái gì" phải nằm ở đây thì đích thả mới biết có nên sáng lên
 * hay không.
 */
@Injectable({ providedIn: 'root' })
export class ItemDragService {
  private readonly api = inject(ApiService);
  private readonly navEvents = inject(NavEventsService);
  private readonly stats = inject(StatsService);

  /** Các mục đang được kéo (rỗng = không có thao tác kéo nội bộ nào). */
  readonly items = signal<DragItem[]>([]);
  readonly dragging = computed(() => this.items().length > 0);
  readonly moving = signal(false);

  private readonly movedSubject = new Subject<{
    items: DragItem[];
    folderId: string | null;
  }>();
  /** Bắn sau khi chuyển xong -> trang đang mở tự tải lại danh sách. */
  readonly moved = this.movedSubject.asObservable();

  private readonly failedSubject = new Subject<string>();
  readonly failed = this.failedSubject.asObservable();

  start(ev: DragEvent, items: DragItem[]): void {
    if (!items.length) return;
    this.items.set(items);
    const dt = ev.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = 'move';
    dt.setData(ITEM_DRAG_MIME, JSON.stringify(items));
    // Fallback dễ đọc nếu người dùng lỡ thả ra ngoài app (VD ô nhập liệu).
    dt.setData('text/plain', items.map((i) => i.name).join(', '));
  }

  end(): void {
    this.items.set([]);
  }

  /** Đây là kéo nội bộ hay kéo tệp từ máy vào (luồng tải lên của Shell)? */
  isInternal(ev: DragEvent): boolean {
    return !!ev.dataTransfer?.types?.includes(ITEM_DRAG_MIME);
  }

  /**
   * Thả vào `folderId` có hợp lệ không. Chỉ chặn được trường hợp hiển nhiên
   * (thả thư mục vào chính nó) vì client không giữ sẵn cả cây; thả vào thư mục
   * **con cháu** của nó do backend chặn (`folders.service.ts` → `move`) và lỗi
   * được hiện qua `failed`.
   */
  canDropInto(folderId: string | null): boolean {
    const items = this.items();
    if (!items.length) return false;
    return !items.some((it) => it.kind === 'folder' && it.id === folderId);
  }

  /** Thực hiện chuyển. Gọi từ handler `drop` của đích. */
  drop(ev: DragEvent, folderId: string | null): void {
    if (!this.isInternal(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const items = this.items();
    this.end();
    if (!items.length || this.moving()) return;
    if (items.some((it) => it.kind === 'folder' && it.id === folderId)) {
      this.failedSubject.next('Không thể chuyển thư mục vào chính nó');
      return;
    }

    this.moving.set(true);
    const reqs = items.map((it) =>
      it.kind === 'file'
        ? this.api.moveFile(it.id, folderId)
        : this.api.moveFolder(it.id, folderId),
    );
    forkJoin(reqs).subscribe({
      next: () => {
        this.moving.set(false);
        if (items.some((it) => it.kind === 'folder')) {
          this.navEvents.bumpFolders();
        }
        this.stats.refreshSoon();
        this.movedSubject.next({ items, folderId });
      },
      error: (err) => {
        this.moving.set(false);
        this.failedSubject.next(err?.error?.message ?? 'Chuyển thất bại');
      },
    });
  }
}
