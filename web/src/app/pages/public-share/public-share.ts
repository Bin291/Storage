import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { FileSource } from '../../core/file-source';
import { FileItem, PublicShareMeta } from '../../core/models';
import { formatSize, iconForExtension } from '../../core/file-utils';
import {
  PreviewKind,
  isPreviewKindOpenable,
  previewKindForExtension,
} from '../../core/preview-kind';
import { FilePreview } from '../../shared/preview/file-preview';

interface Row {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  size: string | null;
}

/**
 * Trang link công khai `/s/:token` (mục 12.F) — kênh B.
 *
 * Nằm NGOÀI `Shell`/`authGuard`: người nhận không có tài khoản vẫn phải vào
 * được. Mọi nội dung lấy qua backend bằng presigned TTL ngắn — trang này
 * KHÔNG bao giờ chạm tới URL public của bucket (mục 12.B).
 */
@Component({
  selector: 'app-public-share',
  imports: [FormsModule, FilePreview],
  templateUrl: './public-share.html',
  styleUrl: './public-share.scss',
})
export class PublicShare implements OnInit {
  private readonly api = inject(ApiService);

  /** Route binding: /s/:token */
  readonly token = input.required<string>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly meta = signal<PublicShareMeta | null>(null);

  readonly password = signal('');
  readonly unlocking = signal(false);
  readonly unlockError = signal<string | null>(null);
  readonly session = signal<string | null>(null);

  readonly formatSize = formatSize;
  readonly iconForExtension = iconForExtension;

  // Duyệt cây (chỉ với link chia sẻ thư mục).
  readonly path = signal<{ id: string; name: string }[]>([]);
  readonly rows = signal<Row[]>([]);

  readonly isFolder = computed(() => this.meta()?.kind === 'folder');

  // ngOnInit chứ KHÔNG phải constructor: `input.required()` (token) chưa có giá
  // trị lúc dựng component, đọc sớm sẽ ném NG0950 và trang trắng im lặng.
  ngOnInit(): void {
    // sessionStorage: giữ phiên đã mở khoá qua lần F5, nhưng không lưu vĩnh viễn.
    const saved = sessionStorage.getItem(this.sessionKey());
    if (saved) this.session.set(saved);
    this.load();
  }

  private sessionKey(): string {
    return `share-session:${this.token()}`;
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.publicShareMeta(this.token(), this.session()).subscribe({
      next: (m) => {
        this.meta.set(m);
        this.loading.set(false);
        if (!m.requiresPassword && m.kind === 'folder') {
          this.path.set([{ id: m.id!, name: m.name! }]);
          this.browse();
        }
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? 'Link không tồn tại, đã hết hạn hoặc bị thu hồi.',
        );
      },
    });
  }

  unlock(): void {
    const pw = this.password();
    if (!pw) return;
    this.unlocking.set(true);
    this.unlockError.set(null);
    this.api.unlockShare(this.token(), pw).subscribe({
      next: ({ session }) => {
        this.session.set(session);
        sessionStorage.setItem(this.sessionKey(), session);
        this.unlocking.set(false);
        this.password.set('');
        this.load();
      },
      error: () => {
        this.unlocking.set(false);
        this.unlockError.set('Mật khẩu không đúng.');
      },
    });
  }

  // --- Duyệt thư mục ---

  private browse(): void {
    const current = this.path()[this.path().length - 1];
    this.loading.set(true);
    this.api
      .publicShareList(this.token(), current?.id, this.session())
      .subscribe({
        next: (res) => {
          this.rows.set([
            ...res.folders.map((f) => ({
              kind: 'folder' as const,
              id: f.id,
              name: f.name,
              extension: null,
              size: null,
            })),
            ...res.files.map((f: FileItem) => ({
              kind: 'file' as const,
              id: f.id,
              name: f.name,
              extension: f.extension,
              size: f.size,
            })),
          ]);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không mở được thư mục này.');
          this.loading.set(false);
        },
      });
  }

  openRow(row: Row): void {
    if (row.kind === 'folder') {
      this.path.update((p) => [...p, { id: row.id, name: row.name }]);
      this.browse();
    } else {
      this.openPreview(row);
    }
  }

  goUp(index: number): void {
    this.path.update((p) => p.slice(0, index + 1));
    this.browse();
  }

  // --- Xem trước / tải xuống ---

  readonly previewRow = signal<Row | null>(null);
  readonly previewKind = signal<PreviewKind>('other');

  readonly previewSource = computed<FileSource | null>(() => {
    const r = this.previewRow();
    if (!r) return null;
    // Link chia sẻ 1 tệp thì không cần fileId; link thư mục thì bắt buộc.
    return this.api.publicSource(
      this.token(),
      this.isFolder() ? r.id : undefined,
      this.session(),
    );
  });

  /** Nguồn cho trường hợp link chia sẻ đúng 1 tệp — hiển thị ngay, không cần bấm. */
  readonly singleFileSource = computed<FileSource | null>(() => {
    const m = this.meta();
    if (!m || m.requiresPassword || m.kind !== 'file') return null;
    return this.api.publicSource(this.token(), undefined, this.session());
  });

  readonly singleFileKind = computed<PreviewKind>(() =>
    previewKindForExtension(this.meta()?.extension ?? ''),
  );

  canPreview(row: Row): boolean {
    return (
      row.kind === 'file' &&
      isPreviewKindOpenable(previewKindForExtension(row.extension ?? ''))
    );
  }

  openPreview(row: Row): void {
    if (!this.canPreview(row)) return;
    this.previewKind.set(previewKindForExtension(row.extension ?? ''));
    this.previewRow.set(row);
  }

  closePreview(): void {
    this.previewRow.set(null);
  }

  async download(row?: Row): Promise<void> {
    const m = this.meta();
    if (!m?.allowDownload) return;
    try {
      const url = await this.api
        .publicSource(
          this.token(),
          row && this.isFolder() ? row.id : undefined,
          this.session(),
        )
        .downloadUrl();
      window.open(url, '_blank');
    } catch {
      this.error.set('Không tải xuống được tệp này.');
    }
  }
}
