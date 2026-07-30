import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { renderAsync } from 'docx-preview';
import { FileSource } from '../../core/file-source';

/**
 * Xem trước DOCX ngay trong app (mục 11.I) — render client-side bằng
 * `docx-preview` (giữ layout trang giấy A4 gần giống Word thật), không cần
 * server convert sang PDF (đỡ phụ thuộc LibreOffice — nặng cho side project).
 */
@Component({
  selector: 'app-docx-viewer',
  template: `
    <div class="dv-scroll" #scroll>
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
  /** Nguồn nội dung theo ngữ cảnh quyền (mục 12.F) — chủ sở hữu/được chia sẻ/link. */
  readonly source = input.required<FileSource>();

  private readonly scroll = viewChild.required<ElementRef<HTMLDivElement>>('scroll');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** docx-preview vẽ trang theo đúng kích thước giấy thật (px) rồi chỉ căn giữa —
   *  không tự phóng to theo khung xem, nên trên màn hình rộng trang trông bé tí
   *  lọt thỏm giữa khoảng tối mênh mông (phản hồi UI: "vỡ định dạng"). Quan sát
   *  lại bằng ResizeObserver để phóng theo bề ngang khung xem (như "Fit width"
   *  của trình đọc PDF), không đổi gì trong DOM do docx-preview tự vẽ ra. */
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // effect() lần đầu chạy sau khi view đã dựng xong -> viewChild có giá trị.
    effect(() => {
      void this.load(this.source());
    });

    this.resizeObserver = new ResizeObserver(() => this.applyFitScale());
    inject(DestroyRef).onDestroy(() => this.resizeObserver?.disconnect());
  }

  private async load(source: FileSource): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const el = this.container().nativeElement;
    el.innerHTML = '';
    el.style.removeProperty('height');
    try {
      const blob = await source.blob();
      await renderAsync(blob, el, el, {
        className: 'docx-render',
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
      });
      this.loading.set(false);
      this.resizeObserver?.disconnect();
      this.resizeObserver?.observe(this.scroll().nativeElement);
      // loading=false chỉ gỡ class "hidden" (display:none) ở tick kế tiếp của
      // Angular -> đo offsetWidth ngay bây giờ sẽ ra 0. Đợi 1 frame đã paint.
      requestAnimationFrame(() => this.applyFitScale());
    } catch {
      this.loading.set(false);
      this.error.set('Không tạo được bản xem trước cho tệp này. Thử tải xuống để mở bằng Word.');
    }
  }

  /** Phóng trang theo bề ngang khung xem NHƯNG không bao giờ phóng quá mức khiến
   *  trang đầu (chiều cao) tràn khỏi khung xem — nếu không người dùng phải cuộn
   *  dọc mới thấy hết trang 1, phản tác dụng của "phóng cho dễ đọc". Tối đa 1.5x
   *  để chữ không bị mờ vỡ nét lúc phóng quá to, không bao giờ thu nhỏ hơn 1x —
   *  mobile giữ nguyên hành vi cuộn ngang cũ (mục "Trang Word có bề ngang cố
   *  định" ở docx-viewer.scss). */
  private applyFitScale(): void {
    const wrap = this.container().nativeElement.querySelector<HTMLElement>(
      '.docx-render-wrapper',
    );
    if (!wrap) return;
    const scrollEl = this.scroll().nativeElement;
    const availableWidth = scrollEl.clientWidth;
    const availableHeight = scrollEl.clientHeight;
    if (!availableWidth || !availableHeight) return;

    wrap.style.transform = '';
    // wrap tự căng full bề ngang khung xem (flex-column + align-items:center của
    // docx-preview) nên KHÔNG dùng wrap.scrollWidth làm bề ngang thật của trang —
    // phải đo đúng phần tử trang <section> bên trong, cộng lại padding ngang của wrap.
    const page = wrap.querySelector<HTMLElement>('section');
    if (!page) return;
    const wrapPaddingX =
      parseFloat(getComputedStyle(wrap).paddingLeft || '0') +
      parseFloat(getComputedStyle(wrap).paddingRight || '0');
    const wrapPaddingY =
      parseFloat(getComputedStyle(wrap).paddingTop || '0') +
      parseFloat(getComputedStyle(wrap).paddingBottom || '0');
    const naturalWidth = page.offsetWidth + wrapPaddingX;
    // Chỉ tính theo chiều cao TRANG ĐẦU (không phải scrollHeight toàn bộ tài
    // liệu) — văn bản nhiều trang không nên bị ép nhỏ lại chỉ để tất cả các
    // trang chung nhau vừa 1 khung xem.
    const firstPageHeight = page.offsetHeight + wrapPaddingY;
    const totalHeight = wrap.scrollHeight;
    if (!naturalWidth || !firstPageHeight || !totalHeight) return;

    const scale = Math.min(
      1.5,
      Math.max(1, Math.min(availableWidth / naturalWidth, availableHeight / firstPageHeight)),
    );
    wrap.style.transformOrigin = 'top center';
    wrap.style.transform = scale > 1 ? `scale(${scale})` : '';
    // transform không đẩy layout -> tự bù chiều cao để khung cuộn tính đúng,
    // không thì phần bị phóng to tràn ra ngoài / để lại khoảng trắng thừa.
    this.container().nativeElement.style.height =
      scale > 1 ? `${totalHeight * scale}px` : '';
  }
}
