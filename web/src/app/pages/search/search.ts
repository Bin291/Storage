import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { SearchResultItem } from '../../core/models';
import { iconForExtension } from '../../core/file-utils';

/**
 * AI omnisearch (mục 8.C): chỉ gọi API khi nhấn Enter (không debounce theo phím)
 * để tiết kiệm quota Gemini. Hiển thị % điểm cho người dùng tự đánh giá.
 */
@Component({
  selector: 'app-search',
  imports: [FormsModule],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search {
  private readonly api = inject(ApiService);

  readonly query = signal('');
  readonly results = signal<SearchResultItem[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly error = signal<string | null>(null);

  run(): void {
    const q = this.query().trim();
    if (!q || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.search(q).subscribe({
      next: (res) => {
        this.results.set(res);
        this.searched.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Tìm kiếm thất bại');
        this.loading.set(false);
      },
    });
  }

  scorePercent(similarity: number): number {
    return Math.round(similarity * 100);
  }

  iconFor(fileName: string): string {
    return iconForExtension(fileName.split('.').pop() ?? '');
  }

  async download(fileId: string, fileName: string): Promise<void> {
    this.api.fileDownloadAttachmentUrl(fileId).subscribe(({ url }) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    });
  }
}
