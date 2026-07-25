import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase.client';

/**
 * Quản lý phiên đăng nhập qua Supabase Auth (mục 3 PLAN.md).
 * State bằng signals để component/guard/interceptor cùng đọc.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);

  readonly session = this._session.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this._session());

  /** Resolve khi phiên ban đầu đã được khôi phục — guard chờ cái này. */
  private resolveReady!: () => void;
  readonly whenReady = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    // Khôi phục phiên đã lưu + lắng nghe thay đổi (login/logout/refresh token).
    void this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this._ready.set(true);
      this.resolveReady();
    });
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
    });
  }

  /** Access token JWT hiện tại để gắn Authorization: Bearer (mục 3). */
  get accessToken(): string | null {
    return this._session()?.access_token ?? null;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
  }

  async signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // Nếu Supabase bật email confirm, session sẽ null cho tới khi xác nhận.
    return { needsConfirm: !data.session };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this._session.set(null);
  }

  async updateDisplayName(displayName: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw new Error(error.message);
  }
}
