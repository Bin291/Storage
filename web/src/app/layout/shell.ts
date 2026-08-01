import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  RouterLink,
  RouterOutlet,
  Router,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import { AuthService } from '../core/auth/auth.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import { NotificationService } from '../core/notifications/notification.service';
import { InboxService } from '../core/notifications/inbox.service';
import type { FileItem, SortField } from '../core/files/file.model';
import type { NotificationItem } from '../core/notifications/notification.model';
import { UploadService } from '../core/upload/upload.service';
import { StatsService } from '../core/stats/stats.service';
import { DropTargetService } from '../core/drag-drop/drop-target.service';
import { ToolbarService } from '../core/ui/toolbar.service';
import { ViewPrefsService } from '../core/ui/view-prefs.service';
import { FormsModule } from '@angular/forms';
import { NavSidebar } from './nav-sidebar';

/** Trang KHÔNG nhận kéo-thả tải lên (mục 11.H) — không có ngữ cảnh "tệp" để tải vào. */
const NO_DROP_PREFIXES = ['/app/settings', '/app/profile'];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, NavSidebar, FormsModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly realtime = inject(RealtimeService);
  private readonly notifications = inject(NotificationService);
  readonly upload = inject(UploadService);
  private readonly stats = inject(StatsService);
  private readonly dropTarget = inject(DropTargetService);
  private readonly api = inject(ApiService);

  readonly user = this.auth.user;
  readonly searchQuery = signal('');
  readonly toolbar = inject(ToolbarService);
  readonly prefs = inject(ViewPrefsService);
  readonly inbox = inject(InboxService);
  readonly inboxOpen = signal(false);
  readonly categoryMenuOpen = signal(false);
  /** Menu gộp lọc/sắp xếp/hiển thị — chỉ hiện ở khổ mobile (xem shell.scss). */
  readonly toolsMenuOpen = signal(false);

  readonly sortOptions: { value: SortField; label: string }[] = [
    { value: 'name', label: 'Tên' },
    { value: 'updatedAt', label: 'Ngày sửa đổi' },
    { value: 'size', label: 'Dung lượng' },
  ];

  readonly mobileSidebarOpen = signal(false);

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update((v) => !v);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  locateUpload(task: any): void {
    if (task.folderId) {
      void this.router.navigate(['/app/folder', task.folderId]);
    } else {
      void this.router.navigate(['/app/files']);
    }
  }

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

  readonly currentCategoryLabel = computed(() => {
    const val = this.toolbar.category();
    const cat = this.categories.find((c) => c.value === (val || ''));
    return cat ? cat.label : 'Tất cả loại';
  });

  selectCategory(val: string): void {
    this.toolbar.onCategoryChange(val);
    this.categoryMenuOpen.set(false);
  }

  // --- Tìm kiếm 2 tầng (mục 11.M) ---
  // Tầng 1 (rẻ): vừa gõ vừa lọc THEO TÊN qua `GET /files?q=` — chạy ngay, không
  // đụng Gemini. Tầng 2 (đắt): nhấn Enter mới chạy AI ngữ nghĩa và mở /search.
  // Giữ đúng quyết định mục 8.C "AI chỉ chạy khi Enter" để không đốt quota.
  readonly nameHits = signal<FileItem[]>([]);
  readonly suggestOpen = signal(false);
  readonly suggestLoading = signal(false);
  private suggestTimer?: ReturnType<typeof setTimeout>;

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    const q = value.trim();
    clearTimeout(this.suggestTimer);
    if (q.length < 2) {
      this.nameHits.set([]);
      this.suggestOpen.set(false);
      return;
    }
    this.suggestOpen.set(true);
    this.suggestLoading.set(true);
    // Debounce 250ms: gõ nhanh không bắn 1 request mỗi phím.
    this.suggestTimer = setTimeout(() => {
      this.api
        .listFiles({ q, pageSize: 8, sort: 'updatedAt', order: 'desc' })
        .subscribe({
          next: (res) => {
            // Bỏ qua kết quả về muộn của truy vấn cũ.
            if (this.searchQuery().trim() !== q) return;
            this.nameHits.set(res.files);
            this.suggestLoading.set(false);
          },
          error: () => this.suggestLoading.set(false),
        });
    }, 250);
  }

  closeSuggest(): void {
    this.suggestOpen.set(false);
  }

  /** Bấm 1 gợi ý theo tên: mở thẳng thư mục chứa tệp đó. */
  openHit(file: FileItem): void {
    this.closeSuggest();
    this.searchQuery.set('');
    void this.router.navigate(
      file.folderId ? ['/app/folder', file.folderId] : ['/app/files'],
      { queryParams: { focus: file.id } },
    );
  }

  /** Enter = tầng 2: hỏi AI (ngữ nghĩa, có tốn quota). */
  triggerSearch(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.closeSuggest();
    void this.router.navigate(['/app/search'], { queryParams: { q } });
  }

  // --- Kéo-thả tải lên trong vùng nội dung (main.content) ---
  // Đếm dragenter/dragleave lồng nhau thay vì bật/tắt boolean trực tiếp, để
  // tránh nhấp nháy overlay khi con trỏ đi qua các phần tử con bên trong.
  private readonly dragCounter = signal(0);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  readonly dropAllowed = computed(
    () => !NO_DROP_PREFIXES.some((p) => this.url().startsWith(p)),
  );
  readonly dragActive = computed(() => this.dragCounter() > 0 && this.dropAllowed());
  readonly dropTargetIsRoot = computed(() => this.dropTarget.folderId() === null);

  constructor() {
    // Số đếm sidebar/Dashboard tự cập nhật khi upload xong (mục 11.H).
    let lastCompleted = 0;
    effect(() => {
      const n = this.upload.completed();
      if (n !== lastCompleted) {
        lastCompleted = n;
        this.stats.refreshSoon();
      }
    });

    effect(() => {
      // Tự động đóng sidebar mobile khi đổi tuyến đường
      this.url();
      this.closeMobileSidebar();
    });
  }

  /** Bấm ra ngoài thì đóng bảng thông báo (không cần overlay riêng). */
  @HostListener('document:click')
  closeInbox(): void {
    if (this.inboxOpen()) this.inboxOpen.set(false);
  }

  toggleInbox(e: Event): void {
    e.stopPropagation(); // nếu không sẽ bị chính HostListener ở trên đóng lại ngay
    this.inboxOpen.update((v) => !v);
  }

  openNotification(n: NotificationItem): void {
    this.inbox.markRead(n.id);
    this.inboxOpen.set(false);
    if (n.linkPath) void this.router.navigateByUrl(n.linkPath);
  }

  ngOnInit(): void {
    this.realtime.start();
    this.notifications.init(); // xin quyền + báo khi file xử lý xong (mục 11.F)
    this.inbox.init(); // chuông thông báo chia sẻ (mục 12.J)
    // File chuyển 'ready'/xoá qua Realtime -> làm mới số đếm (mục 11.H).
    this.realtime.fileChanged.subscribe(() => this.stats.refreshSoon());
  }

  ngOnDestroy(): void {
    this.realtime.stop();
  }

  async signOut(): Promise<void> {
    this.realtime.stop();
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  private hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer?.types?.includes('Files');
  }

  onDragEnter(e: DragEvent): void {
    if (!this.hasFiles(e)) return;
    e.preventDefault();
    this.dragCounter.update((n) => n + 1);
  }
  onDragOver(e: DragEvent): void {
    if (!this.hasFiles(e)) return;
    // Luôn preventDefault khi có file — nếu không trình duyệt sẽ điều hướng
    // sang file:// lúc thả (hành vi mặc định) thay vì cho phép nhận drop.
    e.preventDefault();
  }
  onDragLeave(e: DragEvent): void {
    if (!this.hasFiles(e)) return;
    e.preventDefault();
    // Rời khỏi hẳn cửa sổ trình duyệt (kéo ra ngoài) không đảm bảo bắn đủ số
    // lần dragleave khớp dragenter ở mọi trình duyệt -> reset cứng về 0.
    const leftWindow =
      e.clientX <= 0 ||
      e.clientY <= 0 ||
      e.clientX >= window.innerWidth ||
      e.clientY >= window.innerHeight;
    this.dragCounter.update((n) => (leftWindow ? 0 : Math.max(0, n - 1)));
  }
  onDrop(e: DragEvent): void {
    if (!this.hasFiles(e)) return;
    e.preventDefault();
    this.dragCounter.set(0);
    if (!this.dropAllowed()) return;
    const items = e.dataTransfer?.items;
    const folderId = this.dropTarget.folderId();
    if (items && items.length) {
      void this.upload.uploadDataTransfer(Array.from(items), folderId);
    } else if (e.dataTransfer?.files.length) {
      void this.upload.uploadFiles(Array.from(e.dataTransfer.files), folderId);
    }
  }
}
