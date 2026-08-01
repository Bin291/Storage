import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// Bộ 3 video nền cho cột phải. File nặng (37-107MB) vượt giới hạn 25 MiB/file
// của Cloudflare static assets nên host trên Cloudflare R2 (bucket storage-app-assets),
// không bundle cùng web build nữa.
const ASSETS_BASE_URL = 'https://pub-03f605ba23914bf0ac49b7a80b283b18.r2.dev';
const BACKGROUND_VIDEOS = [
  `${ASSETS_BASE_URL}/1.mp4`,
  `${ASSETS_BASE_URL}/2.mp4`,
  `${ASSETS_BASE_URL}/3.mp4`,
];
/** Mỗi clip lặp lại 2 lần rồi mới chuyển sang video kế tiếp. */
const REPLAYS_PER_VIDEO = 2;
/** Phải khớp với thời gian transition opacity ở login.scss (.bg-video). */
const CROSSFADE_MS = 900;

function pickRandomExcept(exclude: string): string {
  const candidates = BACKGROUND_VIDEOS.filter((v) => v !== exclude);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly email = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  // --- Video nền: 2 lớp <video> chồng nhau, crossfade opacity thay vì đổi
  // thẳng src (đổi src giữa chừng gây "chớp đen" vì clip mới chưa kịp giải
  // mã). Lớp ẩn được nạp trước (load, không play) trong lúc lớp đang hiện
  // phát để tới lúc chuyển cảnh nó đã sẵn dữ liệu, không giật hình.
  @ViewChild('layer0') private layer0?: ElementRef<HTMLVideoElement>;
  @ViewChild('layer1') private layer1?: ElementRef<HTMLVideoElement>;

  private readonly firstVideo = pickRandomExcept('');
  readonly videoSrc = signal<[string, string]>([
    this.firstVideo,
    pickRandomExcept(this.firstVideo),
  ]);
  readonly activeLayer = signal<0 | 1>(0);
  private replayCount = 0;
  private preloadedNext = false;

  private videoEl(layer: 0 | 1): HTMLVideoElement | undefined {
    return (layer === 0 ? this.layer0 : this.layer1)?.nativeElement;
  }

  onVideoEnded(layer: 0 | 1): void {
    if (layer !== this.activeLayer()) return; // lớp ẩn không phát nên bỏ qua

    this.replayCount++;
    if (this.replayCount < REPLAYS_PER_VIDEO) {
      const video = this.videoEl(layer);
      if (video) {
        video.currentTime = 0;
        void video.play();
      }
      return;
    }

    this.switchToNext();
  }

  /** Giữa chừng vòng lặp cuối, tranh thủ nạp trước clip kế tiếp cho lớp ẩn. */
  onTimeUpdate(layer: 0 | 1): void {
    if (layer !== this.activeLayer() || this.preloadedNext) return;
    const video = this.videoEl(layer);
    if (!video || !video.duration) return;
    const isLastLoop = this.replayCount >= REPLAYS_PER_VIDEO - 1;
    if (isLastLoop && video.duration - video.currentTime < 3) {
      this.preloadedNext = true;
      const nextLayer = layer === 0 ? 1 : 0;
      const current = this.videoSrc();
      const next = pickRandomExcept(current[layer]);
      const updated: [string, string] = [...current] as [string, string];
      updated[nextLayer] = next;
      this.videoSrc.set(updated);
      this.videoEl(nextLayer)?.load();
    }
  }

  private switchToNext(): void {
    const active = this.activeLayer();
    const next = active === 0 ? 1 : 0;
    const nextVideo = this.videoEl(next);
    if (nextVideo) {
      nextVideo.currentTime = 0;
      void nextVideo.play();
    }
    this.activeLayer.set(next);
    this.replayCount = 0;
    this.preloadedNext = false;

    // Sau khi crossfade xong, dừng hẳn lớp vừa ẩn đi để đỡ tốn tài nguyên.
    setTimeout(() => {
      const prevVideo = this.videoEl(active);
      prevVideo?.pause();
    }, CROSSFADE_MS);
  }

  toggleMode(): void {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.error.set(null);
    this.notice.set(null);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    this.error.set(null);
    this.notice.set(null);
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.error.set('Vui lòng nhập email và mật khẩu.');
      return;
    }
    this.loading.set(true);
    try {
      if (this.mode() === 'signin') {
        await this.auth.signInWithPassword(email, password);
        await this.router.navigate(['/app']);
      } else {
        const { needsConfirm } = await this.auth.signUp(email, password);
        if (needsConfirm) {
          this.notice.set(
            'Đã gửi email xác nhận. Kiểm tra hộp thư rồi đăng nhập.',
          );
          this.mode.set('signin');
        } else {
          await this.router.navigate(['/app']);
        }
      }
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
