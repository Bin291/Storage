import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';

/**
 * Bản port sang Angular của "ruixen-gradient-footer" (React). Footer bình
 * thường, nhưng dải cầu vồng mờ được ghim đáy viewport và "mọc" lên hết
 * chiều cao đúng lúc cuộn tới cuối trang — 1 <svg> lồng, không canvas.
 */
export interface GradientStop {
  offset: number;
  color: string;
}

const VBW = 1271;
const VBH = 599;

const DEFAULT_STOPS: GradientStop[] = [
  { offset: 0, color: '#340B05' },
  { offset: 0.1827, color: '#0358F7' },
  { offset: 0.2837, color: '#5092C7' },
  { offset: 0.4135, color: '#E1ECFE' },
  { offset: 0.5866, color: '#FFD400' },
  { offset: 0.6827, color: '#FA3D1D' },
  { offset: 0.8029, color: '#FD02F5' },
  { offset: 1, color: '#FFC0FD00' },
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-gradient-footer',
  templateUrl: './gradient-footer.html',
  styleUrl: './gradient-footer.scss',
})
export class GradientFooter implements OnInit, OnDestroy {
  @Input() gradientHeight = '40vh';
  @Input() minReveal = 0.045;
  @Input() bars = 9;
  @Input() blur = 15;
  @Input() peak = 0.98;
  @Input() valley = 0.55;
  @Input() stops: GradientStop[] = DEFAULT_STOPS;

  @ViewChild('band', { static: true }) band!: ElementRef<HTMLDivElement>;

  readonly uid = `rgf-${Math.random().toString(36).slice(2, 9)}`;
  readonly progress = signal(0);

  readonly viewBox = computed(() => `0 0 ${VBW} ${VBH}`);

  readonly barRects = computed<Bar[]>(() => {
    const n = this.bars;
    const colW = VBW / n;
    const mid = (n - 1) / 2;
    const out: Bar[] = [];
    for (let i = 0; i < n; i++) {
      const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;
      const eased = 1 - Math.pow(t, 1.24);
      const h = this.peak * VBH * (this.valley + (1 - this.valley) * eased);
      out.push({ x: i * colW, y: VBH - h, width: colW * 1.23, height: h });
    }
    return out;
  });

  private rafId: number | null = null;

  ngOnInit(): void {
    this.progress.set(this.minReveal);
    this.measure();
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onScroll(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.measure();
    });
  }

  private measure(): void {
    const el = this.band?.nativeElement;
    if (!el) return;
    const h = el.offsetHeight || 1;
    const left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    const t = clamp01((h - left) / h);
    this.progress.set(this.minReveal + (1 - this.minReveal) * t);
  }
}
