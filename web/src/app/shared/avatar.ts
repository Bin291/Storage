import { Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { AvatarService } from '../core/ui/avatar.service';

/**
 * Ảnh đại diện dùng chung (topnav + trang Profile — mục 11.E): hiện <img>
 * nếu user đã tải avatar; lỗi tải (chưa từng tải lên) -> fallback vòng tròn
 * chữ cái đầu tên/email, để nhận biết người dùng khi chia sẻ màn hình.
 */
@Component({
  selector: 'app-avatar',
  template: `
    @if (avatar.hasAvatar() && avatar.url(); as src) {
      <img
        class="av-img"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [src]="src"
        alt="Ảnh đại diện"
        (error)="avatar.markMissing()"
      />
    } @else {
      <span
        class="av-fallback"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.fontSize.px]="fontSize()"
      >{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .av-img,
    .av-fallback {
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .av-img {
      object-fit: cover;
    }
    .av-fallback {
      background: linear-gradient(135deg, var(--c-accent), var(--c-accent-strong));
      color: var(--c-on-accent);
      font-weight: 600;
      letter-spacing: 0.02em;
      user-select: none;
    }
  `,
})
export class Avatar {
  private readonly auth = inject(AuthService);
  readonly avatar = inject(AvatarService);

  readonly size = input<number>(32);
  readonly fontSize = computed(() => Math.round(this.size() * 0.36));

  readonly initials = computed(() => {
    const u = this.auth.user();
    const n = (u?.user_metadata?.['display_name'] as string) || u?.email || '?';
    const parts = n.trim().split(/[\s@._-]+/).filter(Boolean);
    return (
      (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
    );
  });
}
