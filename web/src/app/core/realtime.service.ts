import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase.client';
import { AuthService } from './auth.service';
import { FileItem } from './models';

/**
 * Nghe thay đổi bảng File qua Supabase Realtime (mục 7.A) — card tự cập nhật
 * thumbnailUrl/status mà không cần reload. Bảo mật bằng RLS SELECT (supabase-setup.sql).
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  private channel: RealtimeChannel | null = null;

  /** Phát ra mỗi khi 1 File của user thay đổi. */
  readonly fileChanged = new Subject<Partial<FileItem> & { id: string }>();

  start(): void {
    const userId = this.auth.user()?.id;
    if (!userId || this.channel) return;

    this.channel = this.supabase
      .channel('files-changes')
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
      .subscribe();
  }

  stop(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
