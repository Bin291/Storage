import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { AvatarService } from '../../core/avatar.service';
import { formatSize } from '../../core/file-utils';
import { Avatar } from '../../shared/avatar';

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // Hạn mức hiển thị: 10 GB

// Profile dùng thẳng Supabase Auth metadata — không có bảng User (mục 11.E).
@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, Avatar],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly avatar = inject(AvatarService);

  readonly user = this.auth.user;
  readonly displayName = signal<string>('');
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly usage = signal<{ totalBytes: string; count: number } | null>(null);
  readonly formatSize = formatSize;
  readonly quota = QUOTA_BYTES;

  readonly avatarBusy = signal(false);
  readonly avatarError = signal<string | null>(null);

  readonly usedBytes = computed(() => Number(this.usage()?.totalBytes ?? 0));
  readonly usedPct = computed(() =>
    Math.min(100, Math.round((this.usedBytes() / QUOTA_BYTES) * 100)),
  );
  readonly memberSince = computed(() => {
    const c = this.user()?.created_at;
    return c
      ? new Date(c).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : '—';
  });

  // Hình học vòng tròn dung lượng (r = 52).
  readonly circ = 2 * Math.PI * 52;
  readonly dashOffset = computed(() => this.circ * (1 - this.usedPct() / 100));

  constructor() {
    this.api.usage().subscribe((u) => this.usage.set(u));
    // Đồng bộ tên hiển thị khi phiên nạp xong (nếu không đang sửa).
    effect(() => {
      const u = this.user();
      if (u && !this.editing()) {
        this.displayName.set(
          (u.user_metadata?.['display_name'] as string) ?? '',
        );
      }
    });
  }

  startEdit(): void {
    this.editing.set(true);
    this.saved.set(false);
  }
  cancelEdit(): void {
    this.editing.set(false);
    this.displayName.set(
      (this.user()?.user_metadata?.['display_name'] as string) ?? '',
    );
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    try {
      await this.auth.updateDisplayName(this.displayName().trim());
      this.saved.set(true);
      this.editing.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async onPickAvatar(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.avatarBusy.set(true);
    this.avatarError.set(null);
    try {
      await this.avatar.upload(file);
    } catch {
      this.avatarError.set('Tải ảnh đại diện thất bại. Thử lại nhé.');
    } finally {
      this.avatarBusy.set(false);
    }
  }

  async removeAvatar(): Promise<void> {
    this.avatarBusy.set(true);
    this.avatarError.set(null);
    try {
      await this.avatar.remove();
    } catch {
      this.avatarError.set('Xoá ảnh đại diện thất bại. Thử lại nhé.');
    } finally {
      this.avatarBusy.set(false);
    }
  }
}
