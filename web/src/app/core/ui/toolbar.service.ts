import { Injectable, signal } from '@angular/core';
import { SortField, SortOrder } from '../files/file.model';

@Injectable({ providedIn: 'root' })
export class ToolbarService {
  readonly showFilters = signal(false);
  readonly isBrowse = signal(false);
  readonly sort = signal<SortField>('updatedAt');
  readonly order = signal<SortOrder>('desc');
  readonly category = signal<string | null>(null);
  readonly retryingAllThumbnails = signal(false);
  readonly retryAllThumbnailsResult = signal<number | null>(null);

  // Callback to trigger actions on the active Files component
  onRetryMissing: (() => void) | null = null;

  setSort(field: SortField): void {
    if (this.sort() === field) {
      this.order.set(this.order() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.order.set(field === 'name' ? 'asc' : 'desc');
    }
  }

  onCategoryChange(value: string): void {
    this.category.set(value || null);
  }
}
