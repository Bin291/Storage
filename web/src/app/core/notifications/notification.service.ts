import { Injectable, inject } from '@angular/core';
import { RealtimeService } from './realtime.service';
import { ViewPrefsService } from './view-prefs.service';

/**
 * Thông báo trình duyệt (mục 11.F — Phương án 1): tái dùng Realtime sẵn có,
 * chỉ báo khi tab đang mở. Không cần Service Worker/VAPID.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly realtime = inject(RealtimeService);
  private readonly prefs = inject(ViewPrefsService);
  private readonly notified = new Set<string>(); // tránh báo trùng 1 file
  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;

    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    this.realtime.fileChanged.subscribe((file) => {
      if (!this.prefs.notifyOnDone()) return; // tôn trọng cài đặt (mục 11.D/F)
      if (!file?.id || !file.status) return;
      const key = `${file.id}:${file.status}`;
      if (file.status === 'ready' && !this.notified.has(key)) {
        this.notified.add(key);
        this.show('Xử lý xong', `"${file.name ?? 'Tệp'}" đã sẵn sàng.`);
      } else if (file.status === 'failed' && !this.notified.has(key)) {
        this.notified.add(key);
        this.show('Xử lý thất bại', `"${file.name ?? 'Tệp'}" gặp lỗi.`);
      }
    });
  }

  private show(title: string, body: string): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}
