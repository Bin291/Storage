import { Injectable, computed, signal } from '@angular/core';

/** Một mục đang nằm trong bảng nháp (clipboard) của app. */
export interface ClipEntry {
  kind: 'file' | 'folder';
  id: string;
  name: string;
}

export type ClipMode = 'copy' | 'cut';

/**
 * Bảng nháp trong app cho Sao chép / Cắt / Dán (mục 11.N).
 *
 * Cố tình KHÔNG dùng clipboard thật của hệ điều hành: `navigator.clipboard` chỉ
 * chở được text/blob, không chở được "tham chiếu tới tệp trên server", và mỗi
 * lần đọc lại phải xin quyền. Ở đây chỉ cần nhớ id + chế độ, nên một service
 * signal là đủ — dán được ở bất kỳ thư mục nào trong app, kể cả sau khi điều
 * hướng qua lại (service sống theo vòng đời app, không theo trang).
 *
 * Không lưu xuống localStorage: dán ở tab/phiên khác dễ trỏ vào mục đã bị xoá,
 * và "cắt" mà còn sống qua lần mở app sau là hành vi bất ngờ.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  readonly entries = signal<ClipEntry[]>([]);
  readonly mode = signal<ClipMode>('copy');

  readonly hasContent = computed(() => this.entries().length > 0);
  readonly count = computed(() => this.entries().length);

  /** Nhãn ngắn cho menu/nút Dán, VD "Dán 3 mục" / "Dán \"báo cáo.pdf\"". */
  readonly label = computed(() => {
    const items = this.entries();
    if (items.length === 0) return '';
    if (items.length === 1) return `Dán “${items[0].name}”`;
    return `Dán ${items.length} mục`;
  });

  copy(entries: ClipEntry[]): void {
    if (!entries.length) return;
    this.entries.set(entries);
    this.mode.set('copy');
  }

  cut(entries: ClipEntry[]): void {
    if (!entries.length) return;
    this.entries.set(entries);
    this.mode.set('cut');
  }

  clear(): void {
    this.entries.set([]);
  }

  /** Bỏ khỏi bảng nháp những mục vừa bị xoá/không còn tồn tại. */
  forget(ids: string[]): void {
    if (!ids.length) return;
    const gone = new Set(ids);
    this.entries.update((list) => list.filter((e) => !gone.has(e.id)));
  }
}
