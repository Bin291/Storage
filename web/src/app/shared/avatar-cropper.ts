import {
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Modal } from './modal';

/** Cạnh khung cắt hiển thị (CSS px). Ảnh xuất ra luôn 512 bất kể số này. */
const VIEW = 320;
/** Cạnh ảnh xuất ra — backend resize tiếp về 256 (mục 11.L). */
const OUT = 512;

/**
 * Cắt ảnh đại diện (mục 11.L) — tự viết bằng canvas, KHÔNG thêm dependency.
 *
 * Trước đây ảnh bị `sharp().resize(256,256,{fit:'cover'})` cắt tự động vào
 * giữa nên chân dung dọc hay mất đầu. Ở đây người dùng tự chọn khung: kéo để
 * di chuyển, thanh trượt để phóng to, nút xoay 90°. Vùng trong hình tròn chính
 * là phần được giữ — đúng hình dạng avatar hiển thị thật (WYSIWYG).
 *
 * Ảnh xuất ra đã vuông sẵn nên `fit: 'cover'` ở backend không cắt thêm gì —
 * KHÔNG phải sửa `me.controller.ts`.
 */
@Component({
  selector: 'app-avatar-cropper',
  imports: [Modal],
  template: `
    <app-modal title="Cắt ảnh đại diện" (close)="cancel.emit()">
      @if (error()) {
        <p class="ac-error">{{ error() }}</p>
      } @else {
        <div class="ac-stage">
          <canvas
            #canvas
            class="ac-canvas"
            [width]="view * dpr"
            [height]="view * dpr"
            [style.width.px]="view"
            [style.height.px]="view"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (pointercancel)="onPointerUp($event)"
            (pointerleave)="onPointerUp($event)"
          ></canvas>
          <div class="ac-mask"></div>
        </div>

        <div class="ac-controls">
          <span class="mi sm">zoom_out</span>
          <input
            class="ac-zoom"
            type="range"
            min="1"
            max="4"
            step="0.01"
            [value]="zoom()"
            (input)="onZoom($event)"
          />
          <span class="mi sm">zoom_in</span>
          <button class="btn btn-ghost btn-sm" title="Xoay 90°" (click)="rotate()">
            <span class="mi sm">rotate_right</span>
          </button>
        </div>
        <p class="ac-hint">Kéo để di chuyển ảnh · vùng trong vòng tròn sẽ được giữ lại</p>
      }

      <button actions class="btn btn-secondary" (click)="cancel.emit()">Huỷ</button>
      <button actions class="btn btn-primary" [disabled]="!ready() || busy()" (click)="apply()">
        Dùng ảnh này
      </button>
    </app-modal>
  `,
  styleUrl: './avatar-cropper.scss',
})
export class AvatarCropper {
  readonly file = input.required<File>();
  readonly cropped = output<Blob>();
  readonly cancel = output<void>();

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly view = VIEW;
  readonly dpr = Math.min(window.devicePixelRatio || 1, 3);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly zoom = signal(1);
  private offsetX = 0;
  private offsetY = 0;
  private rotation = 0; // độ
  private bitmap: ImageBitmap | null = null;

  constructor() {
    effect(() => {
      void this.load(this.file());
    });
  }

  private async load(file: File): Promise<void> {
    this.ready.set(false);
    this.error.set(null);
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0;
    this.zoom.set(1);
    try {
      // imageOrientation: 'from-image' để trình duyệt tự áp EXIF — không phải
      // tự đọc EXIF bằng tay, cũng không cần thư viện (mục 11.L).
      this.bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      this.ready.set(true);
      this.draw();
    } catch {
      this.error.set('Không đọc được ảnh này. Thử ảnh JPG/PNG/WEBP khác nhé.');
    }
  }

  /** Tỷ lệ tối thiểu để ảnh phủ kín khung vuông (crop hình tròn nội tiếp). */
  private baseScale(): number {
    const b = this.bitmap;
    if (!b) return 1;
    return VIEW / Math.min(b.width, b.height);
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const b = this.bitmap;
    if (!canvas || !b) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const k = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = this.baseScale() * this.zoom();
    ctx.translate((VIEW / 2 + this.offsetX) * k, (VIEW / 2 + this.offsetY) * k);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.scale(s * k, s * k);
    ctx.drawImage(b, -b.width / 2, -b.height / 2);
  }

  onZoom(e: Event): void {
    this.zoom.set(Number((e.target as HTMLInputElement).value));
    this.draw();
  }

  rotate(): void {
    this.rotation = (this.rotation + 90) % 360;
    this.draw();
  }

  // --- Kéo để di chuyển (pointer events: chuột + cảm ứng cùng 1 đường code) ---
  private drag: { x: number; y: number; ox: number; oy: number } | null = null;

  onPointerDown(e: PointerEvent): void {
    if (!this.ready()) return;
    this.drag = { x: e.clientX, y: e.clientY, ox: this.offsetX, oy: this.offsetY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.drag) return;
    this.offsetX = this.drag.ox + (e.clientX - this.drag.x);
    this.offsetY = this.drag.oy + (e.clientY - this.drag.y);
    this.draw();
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.drag) return;
    this.drag = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  /** Vẽ lại đúng khung đó ở 512px rồi xuất webp. */
  async apply(): Promise<void> {
    const b = this.bitmap;
    if (!b) return;
    this.busy.set(true);
    try {
      const out = document.createElement('canvas');
      out.width = OUT;
      out.height = OUT;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      const k = OUT / VIEW; // cùng phép biến đổi, chỉ phóng theo tỷ lệ
      const s = this.baseScale() * this.zoom();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.translate((VIEW / 2 + this.offsetX) * k, (VIEW / 2 + this.offsetY) * k);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.scale(s * k, s * k);
      ctx.drawImage(b, -b.width / 2, -b.height / 2);

      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob(resolve, 'image/webp', 0.9),
      );
      if (!blob) throw new Error('toBlob failed');
      this.cropped.emit(blob);
    } catch {
      this.error.set('Không cắt được ảnh. Thử lại nhé.');
    } finally {
      this.busy.set(false);
    }
  }
}
