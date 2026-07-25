import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DBLCLICK_SCALE = 2.5;

/**
 * Xem ảnh có zoom/pan kiểu Windows Explorer/Photos (mục 11.I):
 * lăn chuột để phóng to/thu nhỏ (co giãn quanh đúng vị trí con trỏ), kéo để
 * di chuyển khi đã zoom, chụm 2 ngón (pinch) trên cảm ứng, double-click để
 * zoom nhanh, thanh công cụ +/-/reset ở dưới. Responsive, không phụ thuộc kích
 * thước ảnh gốc.
 */
@Component({
  selector: 'app-image-viewer',
  template: `
    <div
      #box
      class="iv-box"
      [class.zoomed]="scale() > MIN_SCALE"
      [class.dragging]="dragging()"
      (wheel)="onWheel($event)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointerleave)="onPointerUp()"
      (pointercancel)="onPointerUp()"
      (touchstart)="onTouchStart($event)"
      (touchmove)="onTouchMove($event)"
      (touchend)="onTouchEnd()"
      (dblclick)="onDblClick($event)"
    >
      <img
        [src]="url()"
        [alt]="alt()"
        draggable="false"
        [style.transform]="transform()"
        (load)="onLoad($event)"
      />
    </div>

    <div class="iv-toolbar">
      <button type="button" title="Thu nhỏ" [disabled]="scale() <= MIN_SCALE" (click)="zoomBy(1 / 1.4)">
        <span class="mi sm">remove</span>
      </button>
      <button type="button" class="iv-pct" title="Đặt lại" (click)="reset()">
        {{ Math.round(scale() * 100) }}%
      </button>
      <button type="button" title="Phóng to" [disabled]="scale() >= MAX_SCALE" (click)="zoomBy(1.4)">
        <span class="mi sm">add</span>
      </button>
    </div>
  `,
  styleUrl: './image-viewer.scss',
})
export class ImageViewer {
  readonly url = input.required<string>();
  readonly alt = input<string>('');
  /** Kích thước gốc ảnh — để dialog cha co giãn theo (mục phản hồi UI: không ép khung cố định). */
  readonly naturalSize = output<{ w: number; h: number }>();

  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');

  readonly loaded = signal(false);
  readonly scale = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly dragging = signal(false);

  readonly transform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.scale()})`,
  );

  // Expose cho template (Angular ko cho gọi Math/const trực tiếp trong HTML).
  readonly Math = Math;
  readonly MIN_SCALE = MIN_SCALE;
  readonly MAX_SCALE = MAX_SCALE;

  onLoad(e: Event): void {
    this.loaded.set(true);
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      this.naturalSize.emit({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }

  private clamp(s: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  /** Zoom co giãn quanh 1 điểm cố định trên màn hình (tâm hộp chứa). */
  private zoomAround(nextScaleRaw: number, clientX: number, clientY: number): void {
    const rect = this.box().nativeElement.getBoundingClientRect();
    const nextScale = this.clamp(nextScaleRaw);
    const prevScale = this.scale();
    if (nextScale === prevScale) return;
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    const ratio = nextScale / prevScale;
    this.panX.update((x) => cx - (cx - x) * ratio);
    this.panY.update((y) => cy - (cy - y) * ratio);
    this.scale.set(nextScale);
    if (nextScale <= MIN_SCALE) {
      this.panX.set(0);
      this.panY.set(0);
    }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.zoomAround(this.scale() * factor, e.clientX, e.clientY);
  }

  zoomBy(factor: number): void {
    const rect = this.box().nativeElement.getBoundingClientRect();
    this.zoomAround(this.scale() * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  reset(): void {
    this.scale.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  onDblClick(e: MouseEvent): void {
    if (this.scale() > MIN_SCALE) {
      this.reset();
    } else {
      this.zoomAround(DBLCLICK_SCALE, e.clientX, e.clientY);
    }
  }

  // --- Kéo để di chuyển (chuột/bút, chỉ khi đã zoom) ---
  private dragStart: { x: number; y: number; panX: number; panY: number } | null = null;

  onPointerDown(e: PointerEvent): void {
    if (this.scale() <= MIN_SCALE || e.pointerType === 'touch') return;
    this.dragging.set(true);
    this.dragStart = { x: e.clientX, y: e.clientY, panX: this.panX(), panY: this.panY() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  onPointerMove(e: PointerEvent): void {
    if (!this.dragStart) return;
    this.panX.set(this.dragStart.panX + (e.clientX - this.dragStart.x));
    this.panY.set(this.dragStart.panY + (e.clientY - this.dragStart.y));
  }
  onPointerUp(): void {
    this.dragging.set(false);
    this.dragStart = null;
  }

  // --- Chụm 2 ngón để zoom (cảm ứng) ---
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private touchPanStart: { x: number; y: number; panX: number; panY: number } | null = null;

  private touchDist(t: TouchList): number {
    const [a, b] = [t[0], t[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  private touchMid(t: TouchList): { x: number; y: number } {
    const [a, b] = [t[0], t[1]];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault();
      this.pinchStartDist = this.touchDist(e.touches);
      this.pinchStartScale = this.scale();
    } else if (e.touches.length === 1 && this.scale() > MIN_SCALE) {
      const t = e.touches[0];
      this.touchPanStart = { x: t.clientX, y: t.clientY, panX: this.panX(), panY: this.panY() };
    }
  }
  onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.pinchStartDist > 0) {
      e.preventDefault();
      const dist = this.touchDist(e.touches);
      const mid = this.touchMid(e.touches);
      const nextScale = this.pinchStartScale * (dist / this.pinchStartDist);
      this.zoomAround(nextScale, mid.x, mid.y);
    } else if (e.touches.length === 1 && this.touchPanStart) {
      e.preventDefault();
      const t = e.touches[0];
      this.panX.set(this.touchPanStart.panX + (t.clientX - this.touchPanStart.x));
      this.panY.set(this.touchPanStart.panY + (t.clientY - this.touchPanStart.y));
    }
  }
  onTouchEnd(): void {
    this.pinchStartDist = 0;
    this.touchPanStart = null;
  }
}
