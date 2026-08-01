import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationItem } from './notification.model';

/**
 * Hộp thông báo trong app (mục 12.J).
 *
 * Vì sao cần bảng `Notification` thật chứ không chỉ Realtime: chia sẻ hay xảy
 * ra lúc người nhận đang offline — Realtime-only sẽ nuốt mất thông báo (điểm
 * yếu đã ghi ở mục 11.F). Service này gộp 2 nguồn:
 *   - nạp lịch sử qua REST khi đăng nhập (bắt được cả lúc offline)
 *   - nhận realtime khi đang mở app
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);

  readonly items = signal<NotificationItem[]>([]);
  readonly unread = computed(() => this.items().filter((n) => !n.readAt).length);

  private started = false;

  constructor() {
    let lastUserId: string | null = null;
    effect(() => {
      const uid = this.auth.user()?.id ?? null;
      if (uid === lastUserId) return;
      lastUserId = uid;
      if (uid) this.refresh();
      else this.items.set([]);
    });
  }

  /** Gọi 1 lần từ Shell — đấu nối luồng realtime vào danh sách. */
  init(): void {
    if (this.started) return;
    this.started = true;
    this.realtime.notificationReceived.subscribe((n) => {
      // Chặn trùng: REST có thể đã nạp đúng bản ghi này.
      if (this.items().some((x) => x.id === n.id)) return;
      this.items.update((list) => [n, ...list]);
      this.showBrowserNotification(n);
    });
  }

  refresh(): void {
    this.api.listNotifications().subscribe({
      next: (list) => this.items.set(list),
      error: () => this.items.set([]),
    });
  }

  markRead(id: string): void {
    const now = new Date().toISOString();
    // Optimistic: đánh dấu ngay, không chờ server (hành động không có gì để đồng bộ ngược).
    this.items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? now } : n)),
    );
    this.api.markNotificationRead(id).subscribe({ error: () => this.refresh() });
  }

  markAllRead(): void {
    const now = new Date().toISOString();
    this.items.update((list) =>
      list.map((n) => (n.readAt ? n : { ...n, readAt: now })),
    );
    this.api.markAllNotificationsRead().subscribe({ error: () => this.refresh() });
  }

  private showBrowserNotification(n: NotificationItem): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(n.title, { body: n.body ?? undefined });
    }
  }
}
