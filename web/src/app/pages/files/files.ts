import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, forkJoin, timeout } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { UploadService } from '../../core/upload.service';
import { RealtimeService } from '../../core/realtime.service';
import { ViewPrefsService } from '../../core/view-prefs.service';
import { ToolbarService } from '../../core/toolbar.service';
import { StatsService } from '../../core/stats.service';
import { NavEventsService } from '../../core/nav-events.service';
import { DropTargetService } from '../../core/drop-target.service';
import {
  BreadcrumbNode,
  FileItem,
  FolderItem,
  SortField,
  SortOrder,
} from '../../core/models';
import { groupById } from '../../core/file-groups';
import { formatDate, formatSize, iconForExtension } from '../../core/file-utils';
import {
  PreviewKind,
  isPreviewKindInline,
  isPreviewKindOpenable,
  isThumbnailCapable,
  previewKindForExtension,
} from '../../core/preview-kind';
import { Modal } from '../../shared/modal';
import { ShareDialog } from '../../shared/share-dialog';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { ImageViewer } from '../../shared/preview/image-viewer';
import { DocxViewer } from '../../shared/preview/docx-viewer';
import { SheetViewer } from '../../shared/preview/sheet-viewer';
import { TextViewer } from '../../shared/preview/text-viewer';
import { MediaPlayer } from '../../shared/preview/media-player';

type ItemKind = 'file' | 'folder';
interface Selected {
  kind: ItemKind;
  id: string;
  name: string;
}

interface ZipTask {
  jobId: string;
  status: 'preparing' | 'ready' | 'error';
  count: number;
  url?: string;
  error?: string;
}

type Lens = 'folder' | 'starred' | 'recent' | 'type';

@Component({
  selector: 'app-files',
  imports: [
    FormsModule,
    RouterLink,
    Modal,
    ShareDialog,
    SafeUrlPipe,
    ImageViewer,
    DocxViewer,
    SheetViewer,
    TextViewer,
    MediaPlayer,
  ],
  templateUrl: './files.html',
  styleUrl: './files.scss',
})
export class Files {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly prefs = inject(ViewPrefsService);
  readonly upload = inject(UploadService);
  readonly toolbar = inject(ToolbarService);
  private readonly realtime = inject(RealtimeService);
  private readonly stats = inject(StatsService);
  private readonly navEvents = inject(NavEventsService);
  private readonly dropTarget = inject(DropTargetService);
  private readonly destroyRef = inject(DestroyRef);

  // Route bindings (withComponentInputBinding).
  readonly folderId = input<string | undefined>();
  readonly starred = input<boolean | undefined>();
  readonly recent = input<boolean | undefined>(); // route data (mục 11.H)
  readonly group = input<string | undefined>(); // /type/:group
  readonly ext = input<string | undefined>(); // /type/:group/:ext

  /** Lăng kính hiện tại (mục 11.H). */
  readonly lens = computed<Lens>(() => {
    if (this.group()) return 'type';
    if (this.recent()) return 'recent';
    if (this.starred()) return 'starred';
    return 'folder';
  });
  /** Cắt ngang mọi folder -> hiện breadcrumb folderPath mỗi dòng. */
  readonly crossFolder = computed(
    () => this.lens() === 'type' || this.lens() === 'recent',
  );
  /** Chỉ lăng kính Thư mục mới cho tạo/tải lên + hiện subfolder. */
  readonly isBrowse = computed(() => this.lens() === 'folder');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly subfolders = signal<FolderItem[]>([]);
  readonly files = signal<FileItem[]>([]);
  readonly breadcrumb = signal<BreadcrumbNode[]>([]);
  readonly total = signal(0);

  readonly sort = computed(() => this.toolbar.sort());
  readonly order = computed(() => this.toolbar.order());
  readonly category = computed(() => this.toolbar.category());

  readonly categories = [
    { value: '', label: 'Tất cả loại' },
    { value: 'document', label: 'Tài liệu' },
    { value: 'spreadsheet', label: 'Bảng tính' },
    { value: 'image', label: 'Ảnh' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Âm thanh' },
    { value: 'archive', label: 'Nén' },
    { value: 'code', label: 'Mã nguồn' },
  ];

  /** Định nghĩa nhóm loại đang xem (nếu ở lăng kính Loại). */
  readonly groupDef = computed(() =>
    this.group() ? groupById(this.group()!) : undefined,
  );

  /** Icon Material cho tiêu đề ngữ cảnh (mục 11.H). */
  readonly titleIcon = computed<string>(() => {
    switch (this.lens()) {
      case 'starred':
        return 'star';
      case 'recent':
        return 'schedule';
      case 'type':
        return this.groupDef()?.icon ?? 'category';
      default:
        return 'cloud';
    }
  });

  /** Chữ tiêu đề ngữ cảnh theo lăng kính (mục 11.H). */
  readonly title = computed<string>(() => {
    switch (this.lens()) {
      case 'starred':
        return 'Có gắn dấu sao';
      case 'recent':
        return 'Gần đây';
      case 'type': {
        const g = this.groupDef();
        const label = g ? g.label : 'Theo loại';
        return this.ext() ? `${label} · ${this.ext()!.toUpperCase()}` : label;
      }
      default:
        return 'Tệp của bạn';
    }
  });

  /** Folder đích khi kéo-thả: folder hiện tại (lăng kính Thư mục) hoặc gốc. */
  targetFolderId(): string | null {
    return this.lens() === 'folder' ? (this.folderId() ?? null) : null;
  }

  /**
   * Danh sách đuôi để truy vấn ở lăng kính Loại (mục 11.H). Nhóm đã biết dùng
   * mapping tĩnh; "Khác" suy động từ số đếm (những đuôi lạ đang tồn tại).
   */
  readonly queryExtensions = computed<string[] | null>(() => {
    if (this.lens() !== 'type') return null;
    if (this.ext()) return [this.ext()!.toLowerCase()];
    const g = this.groupDef();
    if (!g) return [];
    if (g.id === 'other') {
      const gs = this.stats.groups().find((x) => x.def.id === 'other');
      return gs ? gs.extensions.map((e) => e.extension) : [];
    }
    return g.extensions;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.subfolders().length === 0 && this.files().length === 0,
  );

  // --- Chọn nhiều (mục 11.J — tải xuống hàng loạt kiểu Drive) ---
  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly selectionCount = computed(() => this.selectedKeys().size);
  readonly hasSelection = computed(() => this.selectionCount() > 0);
  /** Thứ tự hiển thị thực tế (folder trước, file sau) — dùng cho shift-click chọn dải. */
  readonly orderedItems = computed<{ kind: ItemKind; id: string }[]>(() => [
    ...this.subfolders().map((f) => ({ kind: 'folder' as const, id: f.id })),
    ...this.files().map((f) => ({ kind: 'file' as const, id: f.id })),
  ]);
  orderedItemsCount(): number {
    return this.orderedItems().length;
  }
  private lastClickedKey: string | null = null;

  private keyFor(kind: ItemKind, id: string): string {
    return `${kind}:${id}`;
  }
  isSelected(kind: ItemKind, id: string): boolean {
    return this.selectedKeys().has(this.keyFor(kind, id));
  }
  toggleSelect(kind: ItemKind, id: string): void {
    const key = this.keyFor(kind, id);
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    this.lastClickedKey = key;
  }
  private selectRange(kind: ItemKind, id: string): void {
    const items = this.orderedItems();
    const targetKey = this.keyFor(kind, id);
    const lastIdx = this.lastClickedKey
      ? items.findIndex((it) => this.keyFor(it.kind, it.id) === this.lastClickedKey)
      : -1;
    const targetIdx = items.findIndex((it) => this.keyFor(it.kind, it.id) === targetKey);
    if (lastIdx === -1 || targetIdx === -1) {
      this.toggleSelect(kind, id);
      return;
    }
    const [from, to] = lastIdx < targetIdx ? [lastIdx, targetIdx] : [targetIdx, lastIdx];
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      for (let i = from; i <= to; i++) next.add(this.keyFor(items[i].kind, items[i].id));
      return next;
    });
  }
  clearSelection(): void {
    this.selectedKeys.set(new Set());
    this.lastClickedKey = null;
  }
  selectAll(): void {
    this.selectedKeys.set(new Set(this.orderedItems().map((it) => this.keyFor(it.kind, it.id))));
  }

  /** Mục đang được tô sáng bởi 1 cú bấm thường (kiểu Explorer) — tách khỏi
   * `selectedKeys` (chọn nhiều hàng loạt) để không đổi thanh công cụ thường
   * thành thanh "đã chọn" chỉ vì xem chi tiết 1 file. */
  readonly activeKey = signal<string | null>(null);
  isActive(kind: ItemKind, id: string): boolean {
    return this.activeKey() === this.keyFor(kind, id);
  }

  /**
   * Bấm vào 1 mục (kiểu Explorer/Drive): Shift = chọn dải, Ctrl/Cmd = chọn/bỏ
   * lẻ, đang ở chế độ chọn nhiều (đã có mục khác được chọn) = bấm thường
   * cũng toggle (kiểu Drive). Bình thường -> CHỌN + tô sáng đúng 1 mục đó,
   * KHÔNG điều hướng ngay (giống Explorer: bấm đúp mới mở/vào thư mục).
   */
  onItemClick(kind: ItemKind, item: FileItem | FolderItem, ev: MouseEvent): void {
    if (ev.shiftKey) {
      ev.preventDefault();
      this.selectRange(kind, item.id);
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      this.toggleSelect(kind, item.id);
      return;
    }
    if (this.hasSelection()) {
      this.toggleSelect(kind, item.id);
      return;
    }
    const key = this.keyFor(kind, item.id);
    this.activeKey.set(key);
    this.lastClickedKey = key;
    if (kind === 'file') this.selectFile(item as FileItem);
    else this.closeDetail();
  }

  /** Bấm vào khoảng trống (không phải 1 tile) -> bỏ chọn/đóng chi tiết, giống Explorer. */
  onSurfaceClick(ev: MouseEvent): void {
    if (ev.target !== ev.currentTarget) return;
    this.activeKey.set(null);
    this.clearSelection();
    this.closeDetail();
  }

  /** Tải xuống tất cả mục đang chọn — nén thành 1 zip bất đồng bộ (mục 11.J). */
  downloadSelected(): void {
    const fileIds: string[] = [];
    const folderIds: string[] = [];
    for (const key of this.selectedKeys()) {
      const [kind, id] = key.split(':') as [ItemKind, string];
      (kind === 'file' ? fileIds : folderIds).push(id);
    }
    this.clearSelection();
    this.startZipDownload(fileIds, folderIds);
  }

  // --- Xoá nhiều mục đang chọn cùng lúc (mềm — vào Thùng rác, mục 7.E/11.K) ---
  readonly bulkDeleteOpen = signal(false);
  readonly bulkDeleteBusy = signal(false);
  openBulkDelete(): void {
    this.closeMenu();
    this.closeBulkMenu();
    this.bulkDeleteOpen.set(true);
  }
  closeBulkDelete(): void {
    this.bulkDeleteOpen.set(false);
  }
  confirmBulkDelete(): void {
    const keys = [...this.selectedKeys()];
    if (!keys.length) return;
    this.bulkDeleteBusy.set(true);
    const reqs = keys.map((key) => {
      const [kind, id] = key.split(':') as [ItemKind, string];
      return kind === 'file' ? this.api.trashFile(id) : this.api.trashFolder(id);
    });
    forkJoin(reqs).subscribe({
      next: () => {
        this.bulkDeleteBusy.set(false);
        this.bulkDeleteOpen.set(false);
        const fileIds = new Set<string>();
        const folderIds = new Set<string>();
        for (const key of keys) {
          const [kind, id] = key.split(':') as [ItemKind, string];
          (kind === 'file' ? fileIds : folderIds).add(id);
        }
        this.files.update((l) => l.filter((f) => !fileIds.has(f.id)));
        this.subfolders.update((l) => l.filter((f) => !folderIds.has(f.id)));
        this.clearSelection();
        this.stats.refreshSoon();
        if (folderIds.size) this.foldersChanged();
      },
      error: () => this.bulkDeleteBusy.set(false),
    });
  }

  // Modal state
  readonly modal = signal<'rename' | 'delete' | 'move' | null>(null);
  readonly selected = signal<Selected | null>(null);
  readonly nameInput = signal('');
  readonly busy = signal(false);

  // Move-picker state
  readonly pickerFolderId = signal<string | null>(null);
  readonly pickerFolders = signal<FolderItem[]>([]);
  readonly pickerPath = signal<BreadcrumbNode[]>([]);

  readonly formatSize = formatSize;
  readonly formatDate = formatDate;
  readonly iconForExtension = iconForExtension;

  constructor() {
    this.toolbar.showFilters.set(true);
    this.toolbar.sort.set(this.prefs.defaultSort());
    this.toolbar.order.set(this.prefs.defaultOrder());
    this.toolbar.category.set(null);
    this.toolbar.onRetryMissing = () => this.retryAllMissingThumbnails();

    effect(() => {
      this.toolbar.isBrowse.set(this.isBrowse());
    });
    this.destroyRef.onDestroy(() => {
      this.toolbar.showFilters.set(false);
      this.toolbar.onRetryMissing = null;
    });

    // Reload khi đổi lăng kính / folder / sort / filter (mục 11.H).
    effect(() => {
      // đọc để tạo dependency
      this.folderId();
      this.starred();
      this.recent();
      this.group();
      this.ext();
      this.queryExtensions(); // stats tới muộn -> tự truy vấn lại (nhóm "Khác")
      this.sort();
      this.order();
      this.category();
      this.reload();
    });

    // Reload danh sách khi có file upload xong.
    let lastCompleted = 0;
    effect(() => {
      const n = this.upload.completed();
      if (n !== lastCompleted) {
        lastCompleted = n;
        this.reload();
      }
    });

    // Reload khi cấu trúc folder đổi từ nơi khác (VD tạo thư mục mới ở
    // sidebar toàn cục — mục 11.H) trong khi đang xem đúng vị trí đó.
    let lastFoldersBump = this.navEvents.foldersChanged();
    effect(() => {
      const n = this.navEvents.foldersChanged();
      if (n !== lastFoldersBump) {
        lastFoldersBump = n;
        this.reload();
      }
    });

    // Báo Shell (nơi bắt kéo-thả toàn màn hình — mục 11.H) biết đích tải hiện
    // tại; về gốc khi rời trang Files để tránh đích "dính" từ folder cũ.
    effect(() => {
      this.dropTarget.folderId.set(this.targetFolderId());
    });
    this.destroyRef.onDestroy(() => this.dropTarget.folderId.set(null));

    // Menu fixed: đóng khi cuộn để không "trôi" lệch khỏi nút.
    const onScroll = (): void => {
      this.closeMenu();
      this.closeBulkMenu();
    };
    window.addEventListener('scroll', onScroll, true);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('scroll', onScroll, true),
    );

    // Phím tắt khi đang mở preview toàn màn hình: ←/→ lướt file, Esc đóng.
    const onKeydown = (ev: KeyboardEvent): void => {
      if (!this.previewFile()) return;
      if (ev.key === 'ArrowRight') this.previewNext();
      else if (ev.key === 'ArrowLeft') this.previewPrev();
      else if (ev.key === 'Escape') this.closePreview();
    };
    window.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() => window.removeEventListener('keydown', onKeydown));

    // Realtime: cập nhật thumbnail/status của file tại chỗ (mục 7.A).
    this.realtime.fileChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((change) => {
        const patch = (f: FileItem): FileItem => ({
          ...f,
          status: change.status ?? f.status,
          thumbnailUrl:
            change.thumbnailUrl !== undefined
              ? change.thumbnailUrl
              : f.thumbnailUrl,
          errorMessage:
            change.errorMessage !== undefined
              ? change.errorMessage
              : f.errorMessage,
        });
        this.files.update((list) =>
          list.map((f) => (f.id === change.id ? patch(f) : f)),
        );
        // Panel chi tiết đang mở file này -> cập nhật + nạp preview khi vừa 'ready'.
        const cur = this.detail();
        if (cur && cur.id === change.id) {
          const updated = patch(cur);
          this.detail.set(updated);
          if (
            updated.status === 'ready' &&
            this.needsDetailUrl(this.detailKind()) &&
            !this.detailUrl()
          ) {
            this.selectFile(updated);
          }
        }
      });
  }

  retryFile(file: FileItem): void {
    this.api.retryFile(file.id).subscribe(() => {
      this.files.update((l) =>
        l.map((f) =>
          f.id === file.id ? { ...f, status: 'processing', errorMessage: null } : f,
        ),
      );
    });
  }

  /** File 'ready' nhưng lỡ mất/lỗi thầm lặng thumbnail — có thể tạo lại (mục 11.I). */
  readonly retryingThumbnail = signal(false);
  canRetryThumbnail(file: FileItem): boolean {
    return (
      file.status === 'ready' &&
      !file.thumbnailUrl &&
      isThumbnailCapable(previewKindForExtension(file.extension))
    );
  }
  retryThumbnail(file: FileItem): void {
    this.retryingThumbnail.set(true);
    this.api.retryThumbnail(file.id).subscribe({
      next: () => this.retryingThumbnail.set(false),
      error: () => this.retryingThumbnail.set(false),
    });
  }

  /**
   * Tạo lại ảnh xem trước cho MỌI file đang thiếu cùng lúc (mục 11.I) — hữu
   * ích cho các file docx/pdf/xlsx/audio tải lên trước khi có pipeline
   * thumbnail, giờ vẫn chỉ hiện icon mặc định thay vì ảnh xem trước thật.
   */
  readonly retryingAllThumbnails = computed(() => this.toolbar.retryingAllThumbnails());
  readonly retryAllThumbnailsResult = computed(() => this.toolbar.retryAllThumbnailsResult());
  retryAllMissingThumbnails(): void {
    this.toolbar.retryingAllThumbnails.set(true);
    this.toolbar.retryAllThumbnailsResult.set(null);
    this.api.retryMissingThumbnails().subscribe({
      next: ({ count }) => {
        this.toolbar.retryingAllThumbnails.set(false);
        this.toolbar.retryAllThumbnailsResult.set(count);
      },
      error: () => this.toolbar.retryingAllThumbnails.set(false),
    });
  }

  // Kéo-thả + nút "Mới" (tạo thư mục/tải lên) giờ bắt ở Shell/Sidebar toàn
  // cục (mục 11.H) — Files chỉ còn hiển thị nội dung, không xử lý upload nữa.

  // Khoá "view" hiện tại để phân biệt ĐỔI view (folder/starred) với LÀM MỚI cùng view.
  private lastViewKey = ' ';

  private reload(): void {
    const lens = this.lens();
    const fid = this.folderId() ?? null;
    const exts = this.queryExtensions();
    const viewKey = `${lens}|${fid ?? 'root'}|${this.group() ?? ''}|${this.ext() ?? ''}`;
    const viewChanged = viewKey !== this.lastViewKey;
    this.lastViewKey = viewKey;

    // Đổi view -> xoá nội dung cũ + hiện spinner. Cùng view (đổi sort, upload
    // xong) -> giữ nội dung, làm mới ngầm, KHÔNG chớp spinner.
    if (viewChanged) {
      this.files.set([]);
      this.subfolders.set([]);
      this.loading.set(true);
    }
    this.error.set(null);

    // Breadcrumb + subfolders chỉ có ở lăng kính Thư mục (mục 11.H).
    if (lens === 'folder') {
      if (fid) {
        this.api.breadcrumb(fid).subscribe((bc) => this.breadcrumb.set(bc));
      } else {
        this.breadcrumb.set([]);
      }
      this.api.folderChildren(fid).subscribe((f) => this.subfolders.set(f));
    } else {
      this.breadcrumb.set([]);
      this.subfolders.set([]);
    }

    // Nhóm "Khác" chưa có đuôi nào (stats chưa tới) -> chờ, không truy vấn.
    if (lens === 'type' && exts && exts.length === 0) {
      this.files.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }

    // Files — timeout 15s để không kẹt "Đang tải…" vô hạn khi backend chưa chạy.
    this.api
      .listFiles({
        folderId: lens === 'folder' ? fid : null,
        starred: lens === 'starred',
        recent: lens === 'recent',
        extensions: lens === 'type' ? exts : null,
        category: lens === 'folder' ? this.category() : null,
        sort: this.sort(),
        order: this.order(),
        page: 1,
        pageSize: 100,
      })
      .pipe(timeout(15000))
      .subscribe({
        next: (res) => {
          this.files.set(res.files);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(
            'Không tải được danh sách. Kiểm tra backend đã chạy chưa (cd apps → npm run api), rồi Thử lại.',
          );
        },
      });
  }

  /** Nút "Thử lại" khi lỗi tải — ép coi như view mới để hiện spinner + tải lại. */
  retryReload(): void {
    this.lastViewKey = ' ';
    this.reload();
  }

  /** Báo sidebar toàn cục reload cây sau khi cấu trúc folder đổi (mục 11.H). */
  private foldersChanged(): void {
    this.navEvents.bumpFolders();
  }

  setSort(field: SortField): void {
    if (this.toolbar.sort() === field) {
      this.toolbar.order.set(this.toolbar.order() === 'asc' ? 'desc' : 'asc');
    } else {
      this.toolbar.sort.set(field);
      this.toolbar.order.set(field === 'name' ? 'asc' : 'desc');
    }
  }

  onCategoryChange(value: string): void {
    this.toolbar.category.set(value || null);
  }

  openFolder(id: string): void {
    this.router.navigate(['/folder', id]);
  }

  // --- Rename ---
  openRename(kind: ItemKind, id: string, name: string): void {
    this.closeMenu();
    this.selected.set({ kind, id, name });
    this.nameInput.set(name);
    this.modal.set('rename');
  }
  confirmRename(): void {
    const sel = this.selected();
    const name = this.nameInput().trim();
    if (!sel || !name) return;
    this.busy.set(true);
    const req: Observable<unknown> =
      sel.kind === 'file'
        ? this.api.renameFile(sel.id, name)
        : this.api.renameFolder(sel.id, name);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.closeModal();
        this.reload();
        if (sel.kind === 'folder') this.foldersChanged();
      },
      error: () => this.busy.set(false),
    });
  }

  // --- Star ---
  toggleStar(kind: ItemKind, item: FileItem | FolderItem): void {
    const next = !item.isStarred;
    const req: Observable<unknown> =
      kind === 'file'
        ? this.api.starFile(item.id, next)
        : this.api.starFolder(item.id, next);
    req.subscribe(() => {
      if (kind === 'file') {
        this.files.update((list) =>
          list.map((f) => (f.id === item.id ? { ...f, isStarred: next } : f)),
        );
        // Đồng bộ panel chi tiết đang mở cùng file.
        const cur = this.detail();
        if (cur && cur.id === item.id) {
          this.detail.set({ ...cur, isStarred: next });
        }
      } else {
        this.subfolders.update((list) =>
          list.map((f) => (f.id === item.id ? { ...f, isStarred: next } : f)),
        );
      }
      if (this.starred()) this.reload();
    });
  }

  // --- Delete ---
  openDelete(kind: ItemKind, id: string, name: string): void {
    this.closeMenu();
    this.selected.set({ kind, id, name });
    this.modal.set('delete');
  }
  confirmDelete(): void {
    const sel = this.selected();
    if (!sel) return;
    this.busy.set(true);
    // Xoá ở đây LUÔN là xoá mềm — vào Thùng rác, khôi phục được (mục 7.E/11.K).
    const req: Observable<unknown> =
      sel.kind === 'file'
        ? this.api.trashFile(sel.id)
        : this.api.trashFolder(sel.id);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.closeModal();
        // Ẩn ngay khỏi UI (đã set deletedAt ở backend).
        if (sel.kind === 'file') {
          this.files.update((l) => l.filter((f) => f.id !== sel.id));
        } else {
          this.subfolders.update((l) => l.filter((f) => f.id !== sel.id));
          this.foldersChanged();
        }
        this.stats.refreshSoon();
      },
      error: () => this.busy.set(false),
    });
  }

  // --- Move ---
  openMove(kind: ItemKind, id: string, name: string): void {
    this.closeMenu();
    this.selected.set({ kind, id, name });
    this.pickerFolderId.set(null);
    this.pickerPath.set([]);
    this.loadPicker(null);
    this.modal.set('move');
  }
  private loadPicker(folderId: string | null): void {
    this.api.folderChildren(folderId).subscribe((f) => {
      const sel = this.selected();
      // Không cho chọn chính folder đang move làm đích.
      this.pickerFolders.set(
        f.filter((x) => !(sel?.kind === 'folder' && x.id === sel.id)),
      );
    });
  }
  pickerEnter(folder: FolderItem): void {
    this.pickerFolderId.set(folder.id);
    this.pickerPath.update((p) => [...p, { id: folder.id, name: folder.name }]);
    this.loadPicker(folder.id);
  }
  pickerUp(): void {
    const path = this.pickerPath();
    path.pop();
    this.pickerPath.set([...path]);
    const parent = path.length ? path[path.length - 1].id : null;
    this.pickerFolderId.set(parent);
    this.loadPicker(parent);
  }
  confirmMove(): void {
    const sel = this.selected();
    if (!sel) return;
    this.busy.set(true);
    const dest = this.pickerFolderId();
    const req: Observable<unknown> =
      sel.kind === 'file'
        ? this.api.moveFile(sel.id, dest)
        : this.api.moveFolder(sel.id, dest);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.closeModal();
        this.reload();
        if (sel.kind === 'folder') this.foldersChanged();
      },
      error: () => this.busy.set(false),
    });
  }

  // --- Dropdown menu hành động (render Ở GỐC component, ngoài card) ---
  // Đặt ngoài card để tránh card:hover (transform) tạo containing-block cho
  // menu position:fixed rồi bị overflow:hidden cắt -> chớp giật (hình 45/46).
  readonly menu = signal<{
    kind: ItemKind;
    file?: FileItem;
    folder?: FolderItem;
  } | null>(null);
  readonly menuPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  openMenu(kind: ItemKind, item: FileItem | FolderItem, ev: MouseEvent): void {
    const cur = this.menu();
    const curId = cur?.file?.id ?? cur?.folder?.id;
    if (cur && cur.kind === kind && curId === item.id) {
      this.closeMenu();
      return;
    }
    const btn = ev.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    const menuWidth = 188;
    const left = Math.max(
      8,
      Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8),
    );
    this.menuPos.set({ top: r.bottom + 6, left });
    this.menu.set(
      kind === 'file'
        ? { kind, file: item as FileItem }
        : { kind, folder: item as FolderItem },
    );
  }
  onContextMenu(kind: ItemKind, item: FileItem | FolderItem, ev: MouseEvent): void {
    ev.preventDefault();
    const key = this.keyFor(kind, item.id);

    // Bấm phải lên 1 mục ĐANG thuộc lựa chọn nhiều (>1 mục) -> menu áp dụng
    // cho cả lựa chọn, không phải riêng mục vừa bấm.
    if (this.selectionCount() > 1 && this.selectedKeys().has(key)) {
      const menuWidth = 200;
      const left = Math.max(8, Math.min(ev.clientX, window.innerWidth - menuWidth - 8));
      const top = Math.max(8, Math.min(ev.clientY, window.innerHeight - 150));
      this.bulkMenuPos.set({ top, left });
      this.bulkMenuOpen.set(true);
      return;
    }

    // Nếu mục bị bấm phải KHÔNG thuộc lựa chọn nhiều hiện tại -> coi như bấm
    // thường lên nó (bỏ chọn nhiều cũ, chỉ tô sáng + xem chi tiết đúng mục
    // này), giống Explorer. Nếu đã thuộc lựa chọn nhiều -> giữ nguyên.
    if (!this.selectedKeys().has(key)) {
      this.activeKey.set(key);
      if (kind === 'file') {
        this.selectFile(item as FileItem);
      } else {
        this.closeDetail();
      }
    }

    // Position menu at the click coordinates
    const menuWidth = 188;
    const left = Math.max(
      8,
      Math.min(ev.clientX, window.innerWidth - menuWidth - 8),
    );
    const top = Math.max(
      8,
      Math.min(ev.clientY, window.innerHeight - 250),
    );

    this.menuPos.set({ top, left });
    this.menu.set(
      kind === 'file'
        ? { kind, file: item as FileItem }
        : { kind, folder: item as FolderItem },
    );
  }
  closeMenu(): void {
    this.menu.set(null);
  }

  // --- Menu ngữ cảnh cho lựa chọn nhiều (chuột phải lên 1 mục đã chọn) ---
  readonly bulkMenuOpen = signal(false);
  readonly bulkMenuPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  closeBulkMenu(): void {
    this.bulkMenuOpen.set(false);
  }

  // --- Thuộc tính (mục phản hồi UI) — nơi xem breadcrumb folder cha khi ở
  // lăng kính cắt-ngang-folder (mục 11.H), vì dòng breadcrumb inline dưới
  // tên file đã bị ẩn khỏi grid/list để đỡ rối.
  readonly propertiesFile = signal<FileItem | null>(null);
  openProperties(file: FileItem): void {
    this.closeMenu();
    this.propertiesFile.set(file);
  }
  closeProperties(): void {
    this.propertiesFile.set(null);
  }

  // --- Preview (mục 2.2 / 11.I) — full-bleed kiểu Google Drive, có thể lướt
  // qua lại giữa các file xem trước được trong danh sách đang xem (mục phản
  // hồi UI: nền mờ (backdrop blur) thay vì dialog nhỏ, mũi tên trái/phải).
  readonly previewFile = signal<FileItem | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewKind = signal<PreviewKind>('other');
  readonly previewIndex = signal(-1);

  /**
   * Nguồn nội dung cho renderer xem trước (mục 12.F). `computed` chứ KHÔNG gọi
   * hàm thẳng trong template — nếu không mỗi chu kỳ change-detection sẽ tạo ra
   * một object mới, làm `effect()` trong renderer chạy lại vô hạn.
   */
  readonly previewSource = computed(() => {
    const f = this.previewFile();
    return f ? this.api.ownedSource(f.id) : null;
  });

  /** Mọi file xem trước được trong danh sách đang hiển thị (không tính folder). */
  readonly previewList = computed<FileItem[]>(() =>
    this.files().filter(
      (f) => f.status === 'ready' && isPreviewKindOpenable(previewKindForExtension(f.extension)),
    ),
  );
  readonly canPreviewPrev = computed(() => this.previewIndex() > 0);
  readonly canPreviewNext = computed(() => {
    const idx = this.previewIndex();
    return idx >= 0 && idx < this.previewList().length - 1;
  });

  /** Có mở được modal xem trước không (mọi loại trừ "other" — nén/thực thi...). */
  canPreview(file: FileItem): boolean {
    return isPreviewKindOpenable(previewKindForExtension(file.extension));
  }
  /** Render trực tiếp gọn trong modal (ảnh, PDF, audio, video) hay cần chờ tải blob riêng. */
  needsUrl(kind: PreviewKind): boolean {
    return isPreviewKindInline(kind);
  }
  /**
   * Panel chi tiết (hẹp, bên phải) chỉ nhúng trực tiếp ảnh/PDF — audio/video
   * KHÔNG dùng để phát/stream ở đây, chỉ hiện ảnh xem trước tĩnh (thumbnail),
   * bấm vào mới mở modal đầy đủ có trình phát thật (mục phản hồi UI).
   */
  needsDetailUrl(kind: PreviewKind): boolean {
    return kind === 'image';
  }

  // --- Panel chi tiết bên phải (tham chiếu hình 35-36) ---
  readonly detail = signal<FileItem | null>(null);
  readonly detailUrl = signal<string | null>(null);
  readonly detailKind = signal<PreviewKind>('other');

  selectFile(file: FileItem): void {
    this.closeMenu();
    this.detail.set(file);
    const kind = previewKindForExtension(file.extension);
    this.detailKind.set(kind);
    this.detailUrl.set(null);
    if (file.status === 'ready' && this.needsDetailUrl(kind)) {
      this.api.fileDownloadUrl(file.id).subscribe(({ url }) => {
        if (this.detail()?.id === file.id) this.detailUrl.set(url);
      });
    }
  }
  closeDetail(): void {
    this.detail.set(null);
    this.detailUrl.set(null);
  }

  openPreview(file: FileItem): void {
    this.closeMenu();
    if (file.status !== 'ready') return;
    const kind = previewKindForExtension(file.extension);
    if (!isPreviewKindOpenable(kind)) {
      // Không xem trước được -> tải xuống luôn.
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

  /** Lướt qua lại giữa các file trong danh sách đang xem — giữ dialog mở (mục phản hồi UI). */
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

  // --- Download (mục 5.C / 11.J) ---
  downloadFile(file: FileItem): void {
    this.closeMenu();
    if (file.status !== 'ready') return;
    // URL riêng cho tải xuống (attachment + đúng tên gốc) — khác URL nhúng xem trước.
    this.api.fileDownloadAttachmentUrl(file.id).subscribe(({ url }) => {
      this.triggerDownload(url, file.name);
    });
  }

  private triggerDownload(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // --- Tải xuống hàng loạt (mục 11.J): nén zip bất đồng bộ + panel tiến trình ---
  readonly zipTasks = signal<ZipTask[]>([]);

  private startZipDownload(fileIds: string[], folderIds: string[]): void {
    const req =
      folderIds.length === 1 && fileIds.length === 0
        ? this.api.startFolderZip(folderIds[0])
        : this.api.startBulkZip(fileIds, folderIds);
    const count = fileIds.length + folderIds.length;
    req.subscribe({
      next: ({ jobId }) => {
        this.zipTasks.update((list) => [
          ...list,
          { jobId, status: 'preparing', count },
        ]);
        this.pollZip(jobId);
      },
      error: () => {
        this.zipTasks.update((list) => [
          ...list,
          { jobId: crypto.randomUUID(), status: 'error', count, error: 'Không bắt đầu được' },
        ]);
      },
    });
  }

  private pollZip(jobId: string): void {
    this.api.zipStatus(jobId).subscribe((res) => {
      this.zipTasks.update((list) =>
        list.map((t) => (t.jobId === jobId ? { ...t, ...res } : t)),
      );
      if (res.status === 'preparing') {
        setTimeout(() => this.pollZip(jobId), 1500);
      }
    });
  }

  /** Người dùng bấm "Tải xuống ngay" trong panel — click thật để né popup-blocker. */
  downloadZipResult(task: ZipTask): void {
    if (!task.url) return;
    this.triggerDownload(task.url, `download-${task.jobId.slice(0, 8)}.zip`);
  }
  dismissZipTask(jobId: string): void {
    this.zipTasks.update((list) => list.filter((t) => t.jobId !== jobId));
  }

  closeModal(): void {
    this.modal.set(null);
    this.selected.set(null);
    this.busy.set(false);
  }

  // --- Chia sẻ (mục 12.F) ---
  readonly shareTarget = signal<Selected | null>(null);

  openShare(kind: ItemKind, id: string, name: string): void {
    this.closeMenu();
    this.shareTarget.set({ kind, id, name });
  }

  closeShare(): void {
    this.shareTarget.set(null);
  }
}
