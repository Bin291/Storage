import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter, map, startWith } from 'rxjs';
import { ApiService } from '../core/api.service';
import { StatsService } from '../core/stats.service';
import { NavEventsService } from '../core/nav-events.service';
import { UploadService } from '../core/upload.service';
import { DropTargetService } from '../core/drop-target.service';
import { ItemDragService } from '../core/item-drag.service';
import { AuthService } from '../core/auth.service';
import { FolderItem } from '../core/models';
import { GroupId, groupById } from '../core/file-groups';
import { FolderTreeNode } from './folder-tree-node';
import { Modal } from '../shared/modal';
import { Avatar } from '../shared/avatar';
import { Shell } from './shell';

/**
 * Sidebar điều hướng cố định bên trái (mục 11.H): nút "+ Mới" (kiểu Google
 * Drive) trên cùng, rồi 2 lăng kính KHÔNG trộn lẫn — "DUYỆT" (Thư mục) và
 * "THEO LOẠI" (cắt ngang folder). Dashboard nằm trong "DUYỆT".
 */
@Component({
  selector: 'app-nav-sidebar',
  imports: [RouterLink, RouterLinkActive, FolderTreeNode, FormsModule, Modal, Avatar],
  templateUrl: './nav-sidebar.html',
  styleUrl: './nav-sidebar.scss',
})
export class NavSidebar {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly upload = inject(UploadService);
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
  private readonly dropTarget = inject(DropTargetService);
  readonly stats = inject(StatsService);
  private readonly navEvents = inject(NavEventsService);
  private readonly shell = inject(Shell, { optional: true });

  closeSidebar(): void {
    if (this.shell) {
      this.shell.closeMobileSidebar();
    }
  }

  // --- "My Storage" là đích thả về thư mục gốc (mục 11.O) ---
  private readonly itemDrag = inject(ItemDragService);
  readonly rootDropOver = signal(false);

  onRootDragOver(ev: DragEvent): void {
    if (!this.itemDrag.isInternal(ev) || !this.itemDrag.canDropInto(null)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    if (!this.rootDropOver()) this.rootDropOver.set(true);
  }
  onRootDragLeave(): void {
    this.rootDropOver.set(false);
  }
  onRootDrop(ev: DragEvent): void {
    this.rootDropOver.set(false);
    this.itemDrag.drop(ev, null);
  }

  readonly rootFolders = signal<FolderItem[]>([]);
  /** Nhóm đang bung dropdown (mục 11.H). */
  readonly expanded = signal<Set<GroupId>>(new Set());

  // URL hiện tại -> tô đậm đúng mục đang xem.
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly activeFolderId = computed<string | null>(() => {
    const m = /\/folder\/([^/?]+)/.exec(this.url());
    return m ? decodeURIComponent(m[1]) : null;
  });
  readonly activeGroup = computed<string | null>(() => {
    const m = /\/type\/([^/?]+)/.exec(this.url());
    return m ? m[1] : null;
  });
  readonly activeExt = computed<string | null>(() => {
    const m = /\/type\/[^/?]+\/([^/?]+)/.exec(this.url());
    return m ? decodeURIComponent(m[1]) : null;
  });
  /** "My Storage" (lăng kính Thư mục) đang hoạt động khi ở gốc /files hoặc /folder/*. */
  readonly browseActive = computed(() => {
    const u = this.url();
    return u === '/files' || u.startsWith('/files?') || u.startsWith('/folder/');
  });

  // --- Nút "+ Mới" như Google Drive (mục 11.H) — đích tải theo DropTargetService,
  // ĐÃ được trang Files cập nhật khi đang ở đúng folder; ngoài Files thì luôn là gốc.
  readonly newMenuOpen = signal(false);
  toggleNewMenu(): void {
    this.newMenuOpen.update((v) => !v);
  }
  closeNewMenu(): void {
    this.newMenuOpen.set(false);
  }

  private readonly currentGroupDef = computed(() =>
    this.activeGroup() ? groupById(this.activeGroup()!) : undefined,
  );
  /**
   * accept cho <input type=file> — LUÔN nhận mọi loại tệp (mục phản hồi UI:
   * trước đây ở lăng kính Loại (VD "Ảnh") hộp thoại chọn tệp bị lọc cứng theo
   * đúng loại đó, khiến người dùng không chọn được tệp khác dù vẫn muốn tải
   * lên My Storage). Không lọc theo loại nữa, kể cả đang ở lăng kính nào.
   */
  readonly uploadAccept = computed<string>(() => '');
  readonly uploadLabel = computed<string>(() => {
    const g = this.currentGroupDef();
    return g ? `Tải ${g.label.toLowerCase()} lên` : 'Tải tệp lên';
  });

  readonly newFolderModalOpen = signal(false);
  readonly newFolderName = signal('Thư mục không tên');
  readonly busy = signal(false);

  constructor() {
    // Cây thư mục nạp lần đầu + tự nạp lại khi có nơi khác báo folder đổi.
    effect(() => {
      this.navEvents.foldersChanged();
      this.loadRootFolders();
    });
    this.stats.refresh();
  }

  private loadRootFolders(): void {
    this.api.folderChildren(null).subscribe((f) => this.rootFolders.set(f));
  }

  toggleGroup(id: GroupId, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.expanded.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isExpanded(id: GroupId): boolean {
    return this.expanded().has(id);
  }

  // --- "+ Mới": tạo thư mục / tải tệp / tải thư mục (mục 11.H) ---
  openNewFolderModal(): void {
    this.closeNewMenu();
    this.newFolderName.set('Thư mục không tên');
    this.newFolderModalOpen.set(true);
  }
  closeNewFolderModal(): void {
    this.newFolderModalOpen.set(false);
  }
  confirmNewFolder(): void {
    const name = this.newFolderName().trim();
    if (!name) return;
    this.busy.set(true);
    this.api.createFolder(name, this.dropTarget.folderId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.newFolderModalOpen.set(false);
        this.navEvents.bumpFolders();
      },
      error: () => this.busy.set(false),
    });
  }

  onPickFiles(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      void this.upload.uploadFiles(Array.from(input.files), this.dropTarget.folderId());
    }
    input.value = '';
  }
  onPickFolder(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      void this.upload.uploadFolderPicker(
        Array.from(input.files),
        this.dropTarget.folderId(),
      );
    }
    input.value = '';
  }
}
