import { Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { renderAsync } from 'docx-preview';
import { ApiService } from '../../core/api.service';

/**
 * Xem trước DOCX ngay trong app (mục 11.I) — render client-side bằng
 * `docx-preview` (giữ layout trang giấy A4 gần giống Word thật), không cần
 * server convert sang PDF (đỡ phụ thuộc LibreOffice — nặng cho side project).
 */
@Component({
  selector: 'app-docx-viewer',
  template: `
    <div class="dv-scroll">
      @if (loading()) {
        <div class="dv-state"><span class="spinner"></span> Đang tải bản xem trước…</div>
      } @else if (error()) {
        <div class="dv-state error">
          <span class="mi">error</span>
          <p>{{ error() }}</p>
        </div>
      }
      <div class="dv-doc" [class.hidden]="loading() || error()" #container></div>
    </div>
  `,
  styleUrl: './docx-viewer.scss',
})
export class DocxViewer {
  private readonly api = inject(ApiService);

  readonly fileId = input.required<string>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    // effect() lần đầu chạy sau khi view đã dựng xong -> viewChild có giá trị.
    effect(() => {
      void this.load(this.fileId());
    });
  }

  private async load(fileId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const el = this.container().nativeElement;
    el.innerHTML = '';
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        this.api.fileBlob(fileId).subscribe({ next: resolve, error: reject });
      });
      await renderAsync(blob, el, el, {
        className: 'docx-render',
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
      });
      this.loading.set(false);
    } catch {
      this.loading.set(false);
      this.error.set('Không tạo được bản xem trước cho tệp này. Thử tải xuống để mở bằng Word.');
    }
  }
}
