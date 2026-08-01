import { Component, computed, effect, input, signal } from '@angular/core';
import { FileSource } from '../../core/files/file-source';
import { PreviewKind } from '../../core/files/preview-kind';
import { SafeUrlPipe } from '../safe-url.pipe';
import { ImageViewer } from './image-viewer';
import { DocxViewer } from './docx-viewer';
import { SheetViewer } from './sheet-viewer';
import { TextViewer } from './text-viewer';
import { MediaPlayer } from './media-player';

/**
 * Bộ chọn renderer xem trước theo `kind` (mục 12.F).
 *
 * Trang Files có sẵn phiên bản riêng gắn với luồng lướt trái/phải + panel chi
 * tiết của nó, nên KHÔNG dùng component này. Component này gom logic tối thiểu
 * cho 2 ngữ cảnh mới — "Được chia sẻ với tôi" và trang link công khai — để
 * chúng không phải chép lại toàn bộ chuỗi @if renderer.
 */
@Component({
  selector: 'app-file-preview',
  imports: [SafeUrlPipe, ImageViewer, DocxViewer, SheetViewer, TextViewer, MediaPlayer],
  template: `
    @if (needsUrl() && !url()) {
      <div class="fp-state"><span class="spinner"></span> Đang tải…</div>
    } @else if (kind() === 'image') {
      <app-image-viewer [url]="url()!" [alt]="name()" />
    } @else if (kind() === 'pdf') {
      <iframe [src]="url()! | safeUrl" title="preview"></iframe>
    } @else if (kind() === 'audio' || kind() === 'video') {
      <app-media-player
        [kind]="kind() === 'audio' ? 'audio' : 'video'"
        [url]="url()!"
        [title]="name()"
      />
    } @else if (kind() === 'docx') {
      <app-docx-viewer [source]="source()" />
    } @else if (kind() === 'sheet') {
      <app-sheet-viewer [source]="source()" />
    } @else if (kind() === 'text-raw') {
      <app-text-viewer [source]="source()" [mode]="'raw'" />
    } @else if (kind() === 'text-extract') {
      <app-text-viewer [source]="source()" [mode]="'extract'" />
    } @else {
      <div class="fp-state">
        <span class="mi">description</span>
        <p>Không xem trước được loại tệp này.</p>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
    }
    .fp-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--s-sm);
      height: 100%;
      opacity: 0.75;
    }
  `,
})
export class FilePreview {
  readonly source = input.required<FileSource>();
  readonly kind = input.required<PreviewKind>();
  readonly name = input<string>('');

  readonly url = signal<string | null>(null);

  /** Các kind phát trực tiếp qua URL (Range Requests) thay vì đọc bytes. */
  readonly needsUrl = computed(() =>
    ['image', 'pdf', 'audio', 'video'].includes(this.kind()),
  );

  constructor() {
    effect(() => {
      const src = this.source();
      const needs = this.needsUrl();
      this.url.set(null);
      if (!needs) return;
      void src
        .contentUrl()
        .then((u) => this.url.set(u))
        .catch(() => this.url.set(null));
    });
  }
}
