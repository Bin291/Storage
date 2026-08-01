import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { FileSource } from '../../core/files/file-source';
import { FileItem } from '../../core/files/file.model';
import { SharedWithMeItem } from '../../core/share/share.model';
import { formatDate, formatSize, iconForExtension } from '../../core/files/file-utils';
import {
  PreviewKind,
  isPreviewKindOpenable,
  previewKindForExtension,
} from '../../core/files/preview-kind';
import { FilePreview } from '../../shared/preview/file-preview';

/** 1 dòng đang hiển thị — mục gốc được chia sẻ, hoặc con khi duyệt vào thư mục. */
interface Row {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  size: string | null;
  thumbnailUrl: string | null;
  ownerEmail: string | null;
  allowDownload: boolean;
  sharedAt: string | null;
}

/**
 * "Được chia sẻ với tôi" (mục 12.E nhóm C / 12.F).
 *
 * Lăng kính thứ 3, TÁCH BẠCH với Thư mục và Loại (mục 12.A): chỉ hiện thứ
 * người khác chia sẻ cho mình, không trộn vào các view sẵn có. Người nhận chỉ
 * có quyền ĐỌC — không có đổi tên/di chuyển/xoá.
 */
@Component({
  selector: 'app-shared',
  imports: [FilePreview],
  templateUrl: './shared.html',
  styleUrl: './shared.scss',
})
export class Shared {
  private readonly api = inject(ApiService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly items = signal<SharedWithMeItem[]>([]);

  /** Ngăn xếp duyệt vào thư mục được chia sẻ (null = đang ở danh sách gốc). */
  readonly browsing = signal<{
    shareId: string;
    ownerEmail: string | null;
    allowDownload: boolean;
    path: { id: string; name: string }[];
    rows: Row[];
  } | null>(null);

  readonly formatSize = formatSize;
  readonly formatDate = formatDate;
  readonly iconForExtension = iconForExtension;

  readonly rows = computed<Row[]>(() => {
    const b = this.browsing();
    if (b) return b.rows;
    return this.items().map((s) => ({
      kind: s.kind,
      id: s.id,
      name: s.name,
      extension: s.extension,
      size: s.size,
      thumbnailUrl: s.thumbnailUrl,
      ownerEmail: s.ownerEmail,
      allowDownload: s.allowDownload,
      sharedAt: s.sharedAt,
    }));
  });

  readonly isEmpty = computed(() => !this.loading() && this.rows().length === 0);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.listSharedWithMe().subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không tải được danh sách chia sẻ.');
        this.loading.set(false);
      },
    });
  }

  // --- Duyệt vào thư mục được chia sẻ ---

  openRow(row: Row): void {
    if (row.kind === 'folder') this.enterFolder(row);
    else this.openPreview(row);
  }

  private enterFolder(row: Row): void {
    const b = this.browsing();
    if (b) {
      this.loadFolder(b.shareId, b.ownerEmail, b.allowDownload, [
        ...b.path,
        { id: row.id, name: row.name },
      ]);
      return;
    }
    const item = this.items().find((s) => s.id === row.id && s.kind === 'folder');
    if (!item) return;
    this.loadFolder(item.shareId, item.ownerEmail, item.allowDownload, [
      { id: item.id, name: item.name },
    ]);
  }

  private loadFolder(
    shareId: string,
    ownerEmail: string | null,
    allowDownload: boolean,
    path: { id: string; name: string }[],
  ): void {
    const folderId = path[path.length - 1]?.id;
    this.loading.set(true);
    this.api.browseSharedFolder(shareId, folderId).subscribe({
      next: (res) => {
        this.browsing.set({
          shareId,
          ownerEmail,
          allowDownload,
          path,
          rows: [
            ...res.folders.map((f) => ({
              kind: 'folder' as const,
              id: f.id,
              name: f.name,
              extension: null,
              size: null,
              thumbnailUrl: null,
              ownerEmail,
              allowDownload,
              sharedAt: null,
            })),
            ...res.files.map((f: FileItem) => ({
              kind: 'file' as const,
              id: f.id,
              name: f.name,
              extension: f.extension,
              size: f.size,
              thumbnailUrl: f.thumbnailUrl,
              ownerEmail,
              allowDownload,
              sharedAt: null,
            })),
          ],
        });
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không mở được thư mục này.');
        this.loading.set(false);
      },
    });
  }

  /** Quay lại 1 cấp (index < 0 = về danh sách gốc). */
  goUp(index: number): void {
    const b = this.browsing();
    if (!b) return;
    if (index < 0) {
      this.browsing.set(null);
      return;
    }
    this.loadFolder(
      b.shareId,
      b.ownerEmail,
      b.allowDownload,
      b.path.slice(0, index + 1),
    );
  }

  // --- Xem trước / tải xuống ---

  readonly previewRow = signal<Row | null>(null);
  readonly previewKind = signal<PreviewKind>('other');

  /** computed để renderer không nhận object mới mỗi chu kỳ change-detection. */
  readonly previewSource = computed<FileSource | null>(() => {
    const r = this.previewRow();
    return r ? this.api.sharedSource(r.id) : null;
  });

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

  async download(row: Row): Promise<void> {
    if (row.kind !== 'file' || !row.allowDownload) return;
    try {
      const url = await this.api.sharedSource(row.id).downloadUrl();
      window.open(url, '_blank');
    } catch {
      this.error.set('Không tải xuống được tệp này.');
    }
  }
}
