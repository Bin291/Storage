import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { UploadService } from '../../core/upload/upload.service';
import { AuthService } from '../../core/auth/auth.service';
import { StatsService } from '../../core/stats/stats.service';
import { FileItem } from '../../core/files/file.model';
import { formatSize, formatDate, iconForExtension } from '../../core/files/file-utils';
import {
  PreviewKind,
  isPreviewKindInline,
  isPreviewKindOpenable,
  previewKindForExtension,
} from '../../core/files/preview-kind';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { ImageViewer } from '../../shared/preview/image-viewer';
import { DocxViewer } from '../../shared/preview/docx-viewer';
import { SheetViewer } from '../../shared/preview/sheet-viewer';
import { TextViewer } from '../../shared/preview/text-viewer';
import { MediaPlayer } from '../../shared/preview/media-player';

/**
 * Trang chủ = Dashboard tóm tắt (mục 11.H): thanh dung lượng + "Gần đây" thu
 * nhỏ (giới hạn cứng 8). Cố tình tĩnh & gọn để chống nỗi choáng "Recent đổ
 * đầy màn hình" của Google Drive. Truy cập theo loại đã có sẵn ở sidebar
 * "Theo loại" nên bỏ tile trùng lặp ở đây (đơn giản hoá theo phản hồi).
 */
const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB — đồng bộ trang Profile (mục 11.E)

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    SafeUrlPipe,
    ImageViewer,
    DocxViewer,
    SheetViewer,
    TextViewer,
    MediaPlayer,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(ApiService);

  readonly previewFile = signal<FileItem | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewKind = signal<PreviewKind>('other');
  readonly previewIndex = signal(-1);

  readonly previewSource = computed(() => {
    const f = this.previewFile();
    return f ? this.api.ownedSource(f.id) : null;
  });

  readonly previewList = computed<FileItem[]>(() =>
    this.recent().filter(
      (f) => f.status === 'ready' && isPreviewKindOpenable(previewKindForExtension(f.extension)),
    ),
  );

  readonly canPreviewPrev = computed(() => this.previewIndex() > 0);
  readonly canPreviewNext = computed(() => {
    const idx = this.previewIndex();
    return idx >= 0 && idx < this.previewList().length - 1;
  });

  canPreview(file: FileItem): boolean {
    return isPreviewKindOpenable(previewKindForExtension(file.extension));
  }

  needsUrl(kind: PreviewKind): boolean {
    return isPreviewKindInline(kind);
  }

  openPreview(file: FileItem): void {
    if (file.status !== 'ready') return;
    const kind = previewKindForExtension(file.extension);
    if (!isPreviewKindOpenable(kind)) {
      this.downloadFile(file);
      return;
    }
    this.previewIndex.set(this.previewList().findIndex((f) => f.id === file.id));
    this.loadPreview(file, kind);
  }

  closePreview(): void {
    this.previewFile.set(null);
    this.previewUrl.set(null);
    this.previewIndex.set(-1);
  }

  private loadPreview(file: FileItem, kind: PreviewKind): void {
    this.previewFile.set(file);
    this.previewKind.set(kind);
    this.previewUrl.set(null);
    if (this.needsUrl(kind)) {
      this.api.fileDownloadUrl(file.id).subscribe(({ url }) => {
        if (this.previewFile()?.id === file.id) this.previewUrl.set(url);
      });
    }
  }

  previewPrev(): void {
    const idx = this.previewIndex();
    if (idx <= 0) return;
    const file = this.previewList()[idx - 1];
    this.previewIndex.set(idx - 1);
    this.loadPreview(file, previewKindForExtension(file.extension));
  }

  previewNext(): void {
    const list = this.previewList();
    const idx = this.previewIndex();
    if (idx < 0 || idx >= list.length - 1) return;
    const file = list[idx + 1];
    this.previewIndex.set(idx + 1);
    this.loadPreview(file, previewKindForExtension(file.extension));
  }

  downloadFile(file: FileItem): void {
    if (file.status !== 'ready') return;
    this.api.fileDownloadAttachmentUrl(file.id).subscribe(({ url }) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  private readonly upload = inject(UploadService);
  private readonly auth = inject(AuthService);
  private readonly stats = inject(StatsService);

  readonly formatSize = formatSize;
  readonly formatDate = formatDate;
  readonly iconForExtension = iconForExtension;
  readonly quota = QUOTA_BYTES;

  readonly usage = signal<{ totalBytes: string; count: number } | null>(null);
  readonly recent = signal<FileItem[]>([]);
  readonly recentLoading = signal(true);

  readonly usedBytes = computed(() => Number(this.usage()?.totalBytes ?? 0));
  readonly freeBytes = computed(() => Math.max(0, QUOTA_BYTES - this.usedBytes()));
  readonly usedPct = computed(() =>
    Math.min(100, Math.round((this.usedBytes() / QUOTA_BYTES) * 100)),
  );

  /** Tên gọi trong lời chào — lấy từ Supabase Auth metadata (mục 11.E). */
  readonly firstName = computed(() => {
    const u = this.auth.user();
    const name =
      (u?.user_metadata?.['display_name'] as string) ||
      (u?.email ? u.email.split('@')[0] : '');
    return name.trim();
  });

  // --- Vòng tròn dung lượng (SVG thuần, không thêm thư viện chart) ---
  readonly ringCircumference = 2 * Math.PI * 52; // r=52 trong viewBox 120
  readonly ringOffset = computed(
    () => this.ringCircumference * (1 - this.usedPct() / 100),
  );

  /** Chỉ hiện nhóm loại thực sự CÓ tệp — tránh một rổ ô trống vô nghĩa. */
  readonly groupsWithFiles = computed(() =>
    this.stats.groups().filter((g) => g.count > 0),
  );

  constructor() {
    this.load();
    // Upload xong -> làm mới dung lượng + gần đây.
    let last = 0;
    effect(() => {
      const n = this.upload.completed();
      if (n !== last) {
        last = n;
        this.load();
      }
    });
  }

  private load(): void {
    this.api.usage().subscribe((u) => this.usage.set(u));
    this.stats.refresh(); // số đếm cho ô "Truy cập nhanh" (dùng chung sidebar)
    this.recentLoading.set(true);
    this.api
      .listFiles({ recent: true, sort: 'updatedAt', order: 'desc', pageSize: 8 })
      .subscribe({
        next: (res) => {
          this.recent.set(res.files);
          this.recentLoading.set(false);
        },
        error: () => this.recentLoading.set(false),
      });
  }
}
