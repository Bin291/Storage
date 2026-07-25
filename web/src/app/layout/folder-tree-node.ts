import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { FolderItem } from '../core/models';

/**
 * Node cây thư mục — lazy load con khi expand (mục 11.C), không load hết cây.
 * Tự đệ quy để dựng cây sâu tuỳ ý.
 */
@Component({
  selector: 'app-folder-tree-node',
  imports: [RouterLink, FolderTreeNode],
  template: `
    <div class="node">
      <button
        class="twist"
        (click)="toggle()"
        [class.open]="expanded()"
        aria-label="mở rộng"
      >
        ▸
      </button>
      <a
        class="label"
        [routerLink]="['/folder', folder().id]"
        [class.active]="activeId() === folder().id"
      >
        <span class="mi sm ico fill">folder</span>
        <span class="name">{{ folder().name }}</span>
      </a>
    </div>

    @if (expanded()) {
      <div class="children">
        @if (loading()) {
          <span class="loading">Đang tải…</span>
        }
        @for (child of children(); track child.id) {
          <app-folder-tree-node [folder]="child" [activeId]="activeId()" />
        }
        @if (!loading() && children().length === 0) {
          <span class="empty">Trống</span>
        }
      </div>
    }
  `,
  styles: `
    .node { display: flex; align-items: center; gap: 2px; }
    .twist {
      width: 18px; height: 18px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: var(--c-mute); font-size: 10px;
      transition: transform 0.12s ease;
    }
    .twist.open { transform: rotate(90deg); }
    .label {
      flex: 1; display: flex; align-items: center; gap: var(--s-sm);
      padding: 5px var(--s-sm); border-radius: var(--r-md);
      color: var(--c-charcoal); font-size: var(--fs-body-sm);
      overflow: hidden;
    }
    .label:hover { background: var(--c-surface-soft); text-decoration: none; }
    .label.active { background: var(--c-surface-soft); color: var(--c-ink); font-weight: 500; }
    .label .ico { color: var(--c-accent); flex-shrink: 0; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .children { margin-left: var(--s-lg); }
    .loading, .empty {
      display: block; padding: 4px var(--s-sm);
      font-size: var(--fs-caption); color: var(--c-mute);
    }
  `,
})
export class FolderTreeNode {
  private readonly api = inject(ApiService);

  readonly folder = input.required<FolderItem>();
  readonly activeId = input<string | null>(null);

  readonly expanded = signal(false);
  readonly loading = signal(false);
  readonly children = signal<FolderItem[]>([]);
  private loaded = false;

  toggle(): void {
    this.expanded.set(!this.expanded());
    if (this.expanded() && !this.loaded) {
      this.load();
    }
  }

  private load(): void {
    this.loading.set(true);
    this.api.folderChildren(this.folder().id).subscribe({
      next: (kids) => {
        this.children.set(kids);
        this.loaded = true;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
