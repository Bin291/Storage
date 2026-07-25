import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import imageCompression from 'browser-image-compression';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Avatar cá nhân hoá (mục 11.E) — để nhận biết người dùng khi chia sẻ màn
 * hình. Không có bảng DB riêng: ảnh lưu ở R2 dưới key cố định theo userId
 * (`R2Service.avatarKey`), backend luôn presign URL mới khi hỏi. "Có avatar
 * hay chưa" suy từ việc <img> tải URL đó lỗi hay không — KHÔNG cần cờ boolean
 * lưu ở đâu cả (đúng triết lý "không phát sinh trạng thái thừa" của dự án).
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** URL presigned hiện tại — thử tải; nếu lỗi thì gọi markMissing(). */
  readonly url = signal<string | null>(null);
  /** false = ảnh chưa từng tải lên (hoặc vừa xoá) -> UI fallback về initials. */
  readonly hasAvatar = signal(true);

  constructor() {
    // Nạp lại khi đăng nhập; xoá state khi đăng xuất.
    let lastUserId: string | null = null;
    effect(() => {
      const uid = this.auth.user()?.id ?? null;
      if (uid === lastUserId) return;
      lastUserId = uid;
      if (uid) {
        this.refresh();
      } else {
        this.url.set(null);
        this.hasAvatar.set(true);
      }
    });
  }

  refresh(): void {
    this.api.avatarUrl().subscribe({
      next: ({ url }) => this.url.set(url),
      error: () => this.url.set(null),
    });
  }

  /** <img (error)> gọi khi URL hiện tại 404 (chưa có avatar) — fallback initials. */
  markMissing(): void {
    this.hasAvatar.set(false);
  }

  async upload(file: File): Promise<void> {
    const blob = await this.compress(file);
    const { url } = await firstValueFrom(this.api.uploadAvatar(blob));
    this.url.set(url);
    this.hasAvatar.set(true);
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.api.deleteAvatar());
    this.url.set(null);
    this.hasAvatar.set(false);
  }

  /** Nén nhỏ trước khi gửi — backend resize vuông 256px nên không cần ảnh gốc lớn. */
  private async compress(file: File): Promise<Blob> {
    try {
      return await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        useWebWorker: true,
      });
    } catch {
      return file;
    }
  }
}
