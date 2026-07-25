import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Trình phát audio/video tự thiết kế (mục 11.I) — dùng <video>/<audio> gốc
 * làm engine (Range Requests streaming/tua sẵn có, native, không cần backend
 * đổi gì) nhưng ẩn control mặc định của trình duyệt, tự vẽ UI theo hệ thiết
 * kế của app thay vì để giao diện player thô của Chrome/Firefox.
 */
@Component({
  selector: 'app-media-player',
  imports: [NgTemplateOutlet],
  template: `
    @if (kind() === 'video') {
      <div
        #videoBox
        class="mp-video-box"
        (mousemove)="wakeControls()"
        (mouseleave)="playing() && hideControlsSoon()"
      >
        <video
          #media
          [src]="url()"
          [poster]="poster() || null"
          (click)="togglePlay()"
          (dblclick)="toggleFullscreen()"
          (timeupdate)="onTimeUpdate()"
          (loadedmetadata)="onLoadedMetadata()"
          (play)="playing.set(true)"
          (pause)="playing.set(false)"
          (ended)="playing.set(false)"
          (waiting)="buffering.set(true)"
          (playing)="buffering.set(false)"
        ></video>

        @if (buffering()) {
          <div class="mp-spinner-overlay"><span class="spinner"></span></div>
        }
        @if (!playing()) {
          <button type="button" class="mp-big-play" (click)="togglePlay()">
            <span class="mi fill">play_arrow</span>
          </button>
        }

        <div class="mp-bar mp-bar-video" [class.hidden]="!controlsVisible()">
          <ng-container [ngTemplateOutlet]="controls" />
          <button type="button" class="mp-ico" title="Toàn màn hình" (click)="toggleFullscreen()">
            <span class="mi sm">{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</span>
          </button>
        </div>
      </div>
    } @else {
      <div class="mp-audio-card">
        <audio
          #media
          [src]="url()"
          (timeupdate)="onTimeUpdate()"
          (loadedmetadata)="onLoadedMetadata()"
          (play)="playing.set(true)"
          (pause)="playing.set(false)"
          (ended)="playing.set(false)"
        ></audio>

        <div class="mp-audio-art">
          @if (poster()) {
            <img [src]="poster()!" [alt]="title()" />
          } @else {
            <span class="mi" [class.fill]="playing()">music_note</span>
          }
        </div>
        @if (title()) {
          <div class="mp-audio-title" [title]="title()">{{ title() }}</div>
        }

        <div class="mp-bar mp-bar-audio">
          <ng-container [ngTemplateOutlet]="controls" />
        </div>
      </div>
    }

    <ng-template #controls>
      <button type="button" class="mp-play-btn" [title]="playing() ? 'Tạm dừng' : 'Phát'" (click)="togglePlay()">
        <span class="mi fill">{{ playing() ? 'pause' : 'play_arrow' }}</span>
      </button>

      <span class="mp-time">{{ formatTime(currentTime()) }}</span>
      <input
        class="mp-seek"
        type="range"
        min="0"
        [max]="duration() || 0"
        step="0.1"
        [value]="currentTime()"
        [style.background]="seekBg()"
        (input)="onSeek($event)"
      />
      <span class="mp-time">{{ formatTime(duration()) }}</span>

      <button type="button" class="mp-ico" [title]="muted() ? 'Bật tiếng' : 'Tắt tiếng'" (click)="toggleMute()">
        <span class="mi sm">{{ volumeIcon() }}</span>
      </button>
      <input
        class="mp-volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        [value]="muted() ? 0 : volume()"
        [style.background]="volumeBg()"
        (input)="onVolumeChange($event)"
      />
    </ng-template>
  `,
  styleUrl: './media-player.scss',
})
export class MediaPlayer {
  readonly kind = input.required<'audio' | 'video'>();
  readonly url = input.required<string>();
  readonly poster = input<string | null>(null);
  readonly title = input<string>('');
  /** Kích thước gốc video — để dialog cha co giãn theo (chỉ áp dụng kind video). */
  readonly naturalSize = output<{ w: number; h: number }>();

  private readonly mediaRef = viewChild<ElementRef<HTMLMediaElement>>('media');
  private readonly videoBoxRef = viewChild<ElementRef<HTMLDivElement>>('videoBox');

  readonly playing = signal(false);
  readonly buffering = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(1);
  readonly muted = signal(false);
  readonly isFullscreen = signal(false);
  readonly controlsVisible = signal(true);

   readonly seekBg = computed(() => {
    const pct = this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0;
    return `linear-gradient(to right, var(--c-accent) ${pct}%, rgba(255,255,255,0.25) ${pct}%)`;
  });
  readonly volumeBg = computed(() => {
    const vol = this.muted() ? 0 : this.volume();
    const pct = vol * 100;
    return `linear-gradient(to right, var(--c-accent) ${pct}%, rgba(255,255,255,0.25) ${pct}%)`;
  });
  readonly volumeIcon = computed(() => {
    if (this.muted() || this.volume() === 0) return 'volume_off';
    return this.volume() < 0.5 ? 'volume_down' : 'volume_up';
  });

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Đổi URL (chuyển file khác) -> reset trạng thái phát.
    effect(() => {
      this.url();
      this.playing.set(false);
      this.currentTime.set(0);
      this.duration.set(0);
    });
  }

  private get media(): HTMLMediaElement | undefined {
    return this.mediaRef()?.nativeElement;
  }

  togglePlay(): void {
    const el = this.media;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  onTimeUpdate(): void {
    if (this.media) this.currentTime.set(this.media.currentTime);
  }
  onLoadedMetadata(): void {
    if (this.media) this.duration.set(this.media.duration || 0);
    if (this.kind() === 'video') {
      const el = this.media as HTMLVideoElement | undefined;
      if (el?.videoWidth && el.videoHeight) {
        this.naturalSize.emit({ w: el.videoWidth, h: el.videoHeight });
      }
    }
  }
  onSeek(e: Event): void {
    const value = Number((e.target as HTMLInputElement).value);
    if (this.media) this.media.currentTime = value;
    this.currentTime.set(value);
  }
  onVolumeChange(e: Event): void {
    const value = Number((e.target as HTMLInputElement).value);
    this.volume.set(value);
    this.muted.set(value === 0);
    if (this.media) {
      this.media.volume = value;
      this.media.muted = value === 0;
    }
  }
  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    if (this.media) this.media.muted = next;
  }

  /**
   * Fullscreen NGUYÊN container (.mp-video-box), KHÔNG phải riêng thẻ
   * <video> — nếu chỉ fullscreen <video>, thanh điều khiển tự vẽ (đè màu
   * accent tím...) là anh em (sibling) của <video> nên bị bỏ lại ngoài
   * fullscreen, trình duyệt tự thay bằng control mặc định trắng/xám nhạt
   * không có màu (mục phản hồi UI).
   */
  toggleFullscreen(): void {
    const box = this.videoBoxRef()?.nativeElement;
    if (!box) return;
    if (!document.fullscreenElement) {
      void box.requestFullscreen?.().then(() => this.isFullscreen.set(true));
    } else {
      void document.exitFullscreen?.().then(() => this.isFullscreen.set(false));
    }
  }

  wakeControls(): void {
    this.controlsVisible.set(true);
    this.hideControlsSoon();
  }
  hideControlsSoon(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.playing()) this.controlsVisible.set(false);
    }, 2600);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen.set(!!document.fullscreenElement);
  }

  formatTime(total: number): string {
    if (!Number.isFinite(total) || total < 0) return '0:00';
    const s = Math.floor(total % 60);
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}
