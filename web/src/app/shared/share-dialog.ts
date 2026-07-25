import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ShareView } from '../core/models';
import { Modal } from './modal';

/**
 * Dialog "Chia sẻ" (mục 12.F) — một dialog, 2 phần giống Google Drive:
 *   trên  = mời người dùng theo email (kênh A, người nhận có thông báo)
 *   dưới  = link công khai cho người ngoài app (kênh B)
 *
 * Cả 2 kênh dùng chung endpoint list/thu hồi vì backend lưu chung 1 bảng
 * `Share` (mục 12.A) — nên chỉ cần 1 lần tải danh sách.
 */
@Component({
  selector: 'app-share-dialog',
  imports: [FormsModule, DatePipe, Modal],
  template: `
    <app-modal [title]="'Chia sẻ &quot;' + name() + '&quot;'" (close)="close.emit()">
      <!-- Phần 1: mời theo email (kênh A) -->
      <div class="sd-section">
        <label class="sd-label">Mời người dùng</label>
        <div class="sd-invite-row">
          <input
            class="input"
            type="email"
            placeholder="email@example.com"
            [ngModel]="email()"
            (ngModelChange)="email.set($event); inviteError.set(null)"
            (keyup.enter)="invite()"
          />
          <button class="btn btn-primary btn-sm" [disabled]="busy() || !email().trim()" (click)="invite()">
            Mời
          </button>
        </div>
        @if (inviteError()) {
          <p class="sd-error">{{ inviteError() }}</p>
        }

        @if (invites().length) {
          <ul class="sd-people">
            @for (s of invites(); track s.id) {
              <li class="sd-person">
                <span class="mi sm">account_circle</span>
                <span class="sd-person-email">{{ s.email }}</span>
                <span class="sd-person-role">{{ s.allowDownload ? 'Xem + tải' : 'Chỉ xem' }}</span>
                <button class="btn btn-ghost btn-sm" title="Gỡ quyền" (click)="revoke(s)">
                  <span class="mi sm">close</span>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <hr class="sd-sep" />

      <!-- Phần 2: link công khai (kênh B) -->
      <div class="sd-section">
        <label class="sd-label">Link công khai</label>

        @if (!link()) {
          <p class="sd-hint">Bất kỳ ai có link đều xem được. Dùng khi người nhận không có tài khoản.</p>
          <button class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="createLink()">
            <span class="mi sm">link</span> Tạo link
          </button>
        } @else {
          <div class="sd-link-row">
            <input class="input" type="text" readonly [value]="link()!.url" (focus)="$any($event.target).select()" />
            <button class="btn btn-secondary btn-sm" (click)="copy()">
              {{ copied() ? 'Đã chép' : 'Chép' }}
            </button>
          </div>

          <div class="sd-opts">
            <label class="sd-check">
              <input
                type="checkbox"
                [checked]="link()!.allowDownload"
                (change)="setAllowDownload($any($event.target).checked)"
              />
              Cho phép tải xuống
            </label>

            <label class="sd-inline">
              Hết hạn
              <select class="select" (change)="setExpiry($any($event.target).value)">
                <option value="" [selected]="!link()!.expiresAt">Không</option>
                <option value="1">1 ngày</option>
                <option value="7">7 ngày</option>
                <option value="30">30 ngày</option>
              </select>
            </label>
          </div>

          <div class="sd-opts">
            <label class="sd-inline sd-grow">
              Mật khẩu
              <input
                class="input"
                type="text"
                [placeholder]="link()!.hasPassword ? '••••••  (đang bật)' : 'Để trống = không đặt'"
                [ngModel]="password()"
                (ngModelChange)="password.set($event)"
              />
            </label>
            <button class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="savePassword()">
              {{ password().trim() ? 'Đặt' : 'Gỡ' }}
            </button>
          </div>

          <p class="sd-stats">
            {{ link()!.viewCount }} lượt xem · {{ link()!.downloadCount }} lượt tải
            @if (link()!.expiresAt) {
              · hết hạn {{ link()!.expiresAt | date: 'dd/MM/yyyy' }}
            }
          </p>

          <button class="btn btn-ghost btn-sm danger" [disabled]="busy()" (click)="revoke(link()!)">
            <span class="mi sm">link_off</span> Thu hồi link
          </button>
        }
      </div>

      <button actions class="btn btn-secondary" (click)="close.emit()">Xong</button>
    </app-modal>
  `,
  styleUrl: './share-dialog.scss',
})
export class ShareDialog implements OnInit {
  private readonly api = inject(ApiService);

  readonly kind = input.required<'file' | 'folder'>();
  readonly targetId = input.required<string>();
  readonly name = input.required<string>();
  readonly close = output<void>();
  /** Bắn ra khi số quyền đổi — để danh sách ngoài cập nhật chỉ báo 🔗. */
  readonly changed = output<void>();

  readonly shares = signal<ShareView[]>([]);
  readonly email = signal('');
  readonly password = signal('');
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly inviteError = signal<string | null>(null);

  readonly invites = computed(() => this.shares().filter((s) => s.kind === 'invite'));
  /** Chỉ hiển thị link mới nhất — đủ cho luồng thường gặp (mục 12.C). */
  readonly link = computed(() => this.shares().find((s) => s.kind === 'link') ?? null);

  private get targetBody(): { fileId?: string; folderId?: string } {
    return this.kind() === 'file'
      ? { fileId: this.targetId() }
      : { folderId: this.targetId() };
  }

  // ngOnInit chứ KHÔNG phải constructor: `input.required()` chưa có giá trị lúc
  // dựng component, đọc sớm sẽ ném NG0950 và dialog im lặng không hiện ra.
  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    const t = this.targetBody;
    this.api.listShares(t.fileId, t.folderId).subscribe({
      next: (list) => this.shares.set(list),
      error: () => this.shares.set([]),
    });
  }

  invite(): void {
    const email = this.email().trim();
    if (!email) return;
    this.busy.set(true);
    this.inviteError.set(null);
    this.api.inviteShare({ ...this.targetBody, email }).subscribe({
      next: () => {
        this.email.set('');
        this.busy.set(false);
        this.reload();
        this.changed.emit();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.inviteError.set(err?.error?.message ?? 'Không mời được người dùng này.');
      },
    });
  }

  createLink(): void {
    this.busy.set(true);
    this.api.createShareLink(this.targetBody).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
        this.changed.emit();
      },
      error: () => this.busy.set(false),
    });
  }

  private patchLink(body: {
    allowDownload?: boolean;
    expiresInDays?: number | null;
    password?: string;
  }): void {
    const l = this.link();
    if (!l) return;
    this.busy.set(true);
    this.api.updateShare(l.id, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: () => this.busy.set(false),
    });
  }

  setAllowDownload(value: boolean): void {
    this.patchLink({ allowDownload: value });
  }

  setExpiry(value: string): void {
    this.patchLink({ expiresInDays: value ? Number(value) : null });
  }

  savePassword(): void {
    // Chuỗi rỗng = gỡ mật khẩu (backend hiểu quy ước này — mục 12.E).
    this.patchLink({ password: this.password().trim() });
    this.password.set('');
  }

  async copy(): Promise<void> {
    const url = this.link()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      /* clipboard bị chặn — người dùng tự bôi đen ô input để chép */
    }
  }

  revoke(share: ShareView): void {
    this.busy.set(true);
    this.api.revokeShare(share.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
        this.changed.emit();
      },
      error: () => this.busy.set(false),
    });
  }
}
