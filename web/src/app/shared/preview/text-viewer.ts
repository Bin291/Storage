import { Component, effect, input, signal } from '@angular/core';
import { FileSource } from '../../core/file-source';

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
  /** Nguồn nội dung theo ngữ cảnh quyền (mục 12.F). */
  readonly source = input.required<FileSource>();
  readonly mode = input.required<'raw' | 'extract'>();

  readonly loading = signal(true);
  readonly notAvailable = signal(false);
  readonly text = signal('');

  constructor() {
    effect(() => {
      void this.load(this.source(), this.mode());
    });
  }

  private async load(source: FileSource, mode: 'raw' | 'extract'): Promise<void> {
    this.loading.set(true);
    this.notAvailable.set(false);
    this.text.set('');
    try {
      this.text.set(
        mode === 'raw' ? await (await source.blob()).text() : await source.text(),
      );
      this.loading.set(false);
    } catch {
      this.loading.set(false);
      this.notAvailable.set(true);
    }
  }
}
