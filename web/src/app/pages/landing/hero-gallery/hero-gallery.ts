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
import { RouterLink } from '@angular/router';

/**
 * Bản port sang Angular của "hero-gallery-scroll-animation" (React/motion).
 * Thay useScroll/useTransform bằng 1 scroll listener duy nhất tính progress
 * (0..1) từ vị trí container so với viewport, rồi suy ra translate/scale/opacity
 * bằng nội suy tuyến tính thủ công (thay cho useTransform).
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Nội suy tuyến tính x trong [inMin, inMax] sang [outMin, outMax], kẹp ở 2 đầu. */
function lerp(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (x <= inMin) return outMin;
  if (x >= inMax) return outMax;
  const t = (x - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export type BentoVariant = 'default' | 'threeCells' | 'fourCells';

@Component({
  selector: 'app-hero-gallery',
  imports: [RouterLink],
  templateUrl: './hero-gallery.html',
  styleUrl: './hero-gallery.scss',
})
export class HeroGallery implements OnInit, OnDestroy {
  @Input() images: string[] = [];
  @Input() variant: BentoVariant = 'default';
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
  @Input() primaryLabel = '';
  @Input() secondaryLabel = '';
  @Input() dark = false;

  @ViewChild('scrollTrack', { static: true }) scrollTrack!: ElementRef<HTMLDivElement>;

  /** 0 khi đỉnh track chạm đỉnh viewport, 1 khi đáy track chạm đáy viewport. */
  readonly progress = signal(0);

  readonly cellTranslate = computed(() => `${lerp(this.progress(), 0.1, 0.9, -35, 0)}%`);
  readonly cellScale = computed(() => lerp(this.progress(), 0, 0.9, 0.5, 1));

  readonly contentOpacity = computed(() => lerp(this.progress(), 0, 0.5, 1, 0));
  readonly contentScale = computed(() => lerp(this.progress(), 0, 0.5, 1, 0));
  readonly contentPosition = computed<'fixed' | 'absolute'>(() =>
    this.progress() >= 0.6 ? 'absolute' : 'fixed',
  );

  private rafId: number | null = null;

  ngOnInit(): void {
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
    const el = this.scrollTrack?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const span = rect.height - vh;
    const p = span > 0 ? clamp01(-rect.top / span) : 0;
    this.progress.set(p);
  }
}
