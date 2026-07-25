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
import { AuthService } from '../core/auth.service';
import { RealtimeService } from '../core/realtime.service';
import { NotificationService } from '../core/notification.service';
import { InboxService } from '../core/inbox.service';
import type { NotificationItem } from '../core/models';
import { UploadService } from '../core/upload.service';
import { StatsService } from '../core/stats.service';
import { DropTargetService } from '../core/drop-target.service';
import { ToolbarService } from '../core/toolbar.service';
import { ViewPrefsService } from '../core/view-prefs.service';
import { FormsModule } from '@angular/forms';
import { NavSidebar } from './nav-sidebar';

/** Trang KHÔNG nhận kéo-thả tải lên (mục 11.H) — không có ngữ cảnh "tệp" để tải vào. */
const NO_DROP_PREFIXES = ['/settings', '/profile'];

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
  private readonly upload = inject(UploadService);
  private readonly stats = inject(StatsService);
  private readonly dropTarget = inject(DropTargetService);

  readonly user = this.auth.user;
  readonly searchQuery = signal('');
  readonly toolbar = inject(ToolbarService);
  readonly prefs = inject(ViewPrefsService);
  readonly inbox = inject(InboxService);
  readonly inboxOpen = signal(false);
  readonly categoryMenuOpen = signal(false);

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

  triggerSearch(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.router.navigate(['/search'], { queryParams: { q } });
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
