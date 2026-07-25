import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { UploadService } from '../../core/upload.service';
import { FileItem } from '../../core/models';
import { formatSize, formatDate, iconForExtension } from '../../core/file-utils';

const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB — đồng bộ trang Profile (mục 11.E)

/**
 * Trang chủ = Dashboard tóm tắt (mục 11.H): thanh dung lượng + "Gần đây" thu
 * nhỏ (giới hạn cứng 8). Cố tình tĩnh & gọn để chống nỗi choáng "Recent đổ
 * đầy màn hình" của Google Drive. Truy cập theo loại đã có sẵn ở sidebar
 * "Theo loại" nên bỏ tile trùng lặp ở đây (đơn giản hoá theo phản hồi).
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly api = inject(ApiService);
  private readonly upload = inject(UploadService);

  readonly formatSize = formatSize;
  readonly formatDate = formatDate;
  readonly iconForExtension = iconForExtension;
  readonly quota = QUOTA_BYTES;

  readonly usage = signal<{ totalBytes: string; count: number } | null>(null);
  readonly recent = signal<FileItem[]>([]);
  readonly recentLoading = signal(true);

  readonly usedBytes = computed(() => Number(this.usage()?.totalBytes ?? 0));
  readonly usedPct = computed(() =>
    Math.min(100, Math.round((this.usedBytes() / QUOTA_BYTES) * 100)),
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
