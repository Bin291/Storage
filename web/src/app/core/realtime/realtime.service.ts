import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase.client';
import { AuthService } from '../auth/auth.service';
import { FileItem } from '../files/file.model';
import { NotificationItem } from '../notifications/notification.model';

/**
 * Nghe thay đổi qua Supabase Realtime:
 *  - bảng `File` (mục 7.A) — card tự cập nhật thumbnailUrl/status
 *  - bảng `Notification` (mục 12.J) — chuông báo khi có người chia sẻ
 *
 * Bảo mật bằng RLS SELECT theo `auth.uid()` cho CẢ HAI bảng (supabase-setup.sql);
 * thiếu policy thì user này nghe được dữ liệu của user khác.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  private channel: RealtimeChannel | null = null;

  /** Phát ra mỗi khi 1 File của user thay đổi. */
  readonly fileChanged = new Subject<Partial<FileItem> & { id: string }>();
  /** Phát ra mỗi khi user nhận 1 thông báo mới (mục 12.J). */
  readonly notificationReceived = new Subject<NotificationItem>();

  start(): void {
    const userId = this.auth.user()?.id;
    if (!userId || this.channel) return;

    this.channel = this.supabase
      .channel('app-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'File',
          filter: `userId=eq.${userId}`,
        },
        (payload) => {
          this.fileChanged.next(payload.new as Partial<FileItem> & { id: string });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Notification',
          filter: `userId=eq.${userId}`,
        },
        (payload) => {
          this.notificationReceived.next(payload.new as NotificationItem);
        },
      )
      .subscribe();
  }

  stop(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
