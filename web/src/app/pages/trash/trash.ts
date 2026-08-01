import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { StatsService } from '../../core/stats/stats.service';
import { NavEventsService } from '../../core/nav/nav-events.service';
import { TrashItem } from '../../core/files/trash.model';
import { formatDate, formatSize, iconForExtension } from '../../core/files/file-utils';
import { Modal } from '../../shared/modal';

/**
 * Thùng rác (mục 7.E / 11.K) — danh sách phẳng "trash root", mỗi mục có
 * Khôi phục / Xoá vĩnh viễn, + nút "Dọn thùng rác" xoá vĩnh viễn toàn bộ.
 */
@Component({
  selector: 'app-trash',
  imports: [FormsModule, Modal],
  templateUrl: './trash.html',
  styleUrl: './trash.scss',
})
export class Trash {
  private readonly api = inject(ApiService);
  private readonly stats = inject(StatsService);
  private readonly navEvents = inject(NavEventsService);

  readonly items = signal<TrashItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly formatDate = formatDate;
  readonly formatSize = formatSize;
  readonly iconForExtension = iconForExtension;

  readonly emptyModalOpen = signal(false);
  readonly emptyConfirmText = signal('');
  readonly emptyBusy = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listTrash().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Không tải được Thùng rác.');
      },
    });
  }

  private key(item: TrashItem): string {
    return `${item.kind}:${item.id}`;
  }

  restore(item: TrashItem): void {
    const k = this.key(item);
    this.busyId.set(k);
    const req: Observable<unknown> =
      item.kind === 'file'
        ? this.api.restoreFile(item.id)
        : this.api.restoreFolder(item.id);
    req.subscribe({
      next: () => {
        this.busyId.set(null);
        this.items.update((list) => list.filter((it) => this.key(it) !== k));
        this.stats.refreshSoon();
        if (item.kind === 'folder') this.navEvents.bumpFolders();
      },
      error: () => this.busyId.set(null),
    });
  }

  // --- Xoá vĩnh viễn 1 mục ---
  readonly deleteTarget = signal<TrashItem | null>(null);
  openHardDelete(item: TrashItem): void {
    this.deleteTarget.set(item);
  }
  closeHardDelete(): void {
    this.deleteTarget.set(null);
  }
  confirmHardDelete(): void {
    const item = this.deleteTarget();
    if (!item) return;
    const k = this.key(item);
    this.busyId.set(k);
    const req: Observable<unknown> =
      item.kind === 'file'
        ? this.api.hardDeleteFile(item.id)
        : this.api.hardDeleteFolder(item.id);
    req.subscribe({
      next: () => {
        this.busyId.set(null);
        this.items.update((list) => list.filter((it) => this.key(it) !== k));
        this.closeHardDelete();
      },
      error: () => {
        this.busyId.set(null);
        this.closeHardDelete();
      },
    });
  }

  // --- Dọn thùng rác (xoá vĩnh viễn toàn bộ) ---
  openEmptyModal(): void {
    this.emptyConfirmText.set('');
    this.emptyModalOpen.set(true);
  }
  closeEmptyModal(): void {
    this.emptyModalOpen.set(false);
  }
  get canConfirmEmpty(): boolean {
    return this.emptyConfirmText().trim().toUpperCase() === 'XOÁ';
  }
  confirmEmpty(): void {
    if (!this.canConfirmEmpty || this.items().length === 0) return;
    this.emptyBusy.set(true);
    this.api.emptyTrash().subscribe({
      next: () => {
        this.emptyBusy.set(false);
        this.items.set([]);
        this.closeEmptyModal();
      },
      error: () => this.emptyBusy.set(false),
    });
  }
}
