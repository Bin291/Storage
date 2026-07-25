import { Component, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';

/**
 * Xem trước dạng văn bản (mục 11.I):
 * - mode="raw": tệp .txt/.md — đọc thẳng bytes gốc, chắc chắn có ngay.
 * - mode="extract": pptx/doc/odt/rtf... chưa có renderer trực quan — dùng lại
 *   văn bản AI đã trích xuất sẵn cho tìm kiếm (mục 8.C) làm bản xem trước dự
 *   phòng. Có thể 404 (tệp đang xử lý/không trích được chữ) -> thông báo rõ,
 *   không hiện như lỗi.
 */
@Component({
  selector: 'app-text-viewer',
  template: `
    <div class="tv-wrap">
      @if (loading()) {
        <div class="tv-state"><span class="spinner"></span> Đang tải…</div>
      } @else if (notAvailable()) {
        <div class="tv-state">
          <span class="mi">description</span>
          <p>Chưa có bản xem trước cho loại tệp này.</p>
          <p class="tv-hint">Tải xuống để mở bằng ứng dụng phù hợp.</p>
        </div>
      } @else {
        @if (mode() === 'extract') {
          <div class="tv-banner">
            <span class="mi sm">auto_awesome</span>
            Bản xem trước dạng văn bản (trích xuất tự động) — có thể mất định dạng gốc.
          </div>
        }
        <pre class="tv-content">{{ text() }}</pre>
      }
    </div>
  `,
  styleUrl: './text-viewer.scss',
})
export class TextViewer {
  private readonly api = inject(ApiService);

  readonly fileId = input.required<string>();
  readonly mode = input.required<'raw' | 'extract'>();

  readonly loading = signal(true);
  readonly notAvailable = signal(false);
  readonly text = signal('');

  constructor() {
    effect(() => {
      void this.load(this.fileId(), this.mode());
    });
  }

  private async load(fileId: string, mode: 'raw' | 'extract'): Promise<void> {
    this.loading.set(true);
    this.notAvailable.set(false);
    this.text.set('');
    try {
      if (mode === 'raw') {
        const blob = await new Promise<Blob>((resolve, reject) => {
          this.api.fileBlob(fileId).subscribe({ next: resolve, error: reject });
        });
        this.text.set(await blob.text());
      } else {
        const res = await new Promise<{ text: string }>((resolve, reject) => {
          this.api.fileText(fileId).subscribe({ next: resolve, error: reject });
        });
        this.text.set(res.text);
      }
      this.loading.set(false);
    } catch {
      this.loading.set(false);
      this.notAvailable.set(true);
    }
  }
}
