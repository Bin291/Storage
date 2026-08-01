import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { SupabaseClientService } from '../supabase/supabase.client';
import { authActions } from '../../store/auth/auth.actions';
import {
  selectAuthReady,
  selectIsAuthenticated,
  selectSession,
  selectUser,
} from '../../store/auth/auth.selectors';

/**
 * Quản lý phiên đăng nhập qua Supabase Auth (mục 3 PLAN.md).
 * State sống trong NgRx store (feature "auth") — component/guard/interceptor
 * đọc qua các signal dưới đây, AuthService chỉ là nơi dispatch action.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly store = inject(Store);

  readonly session = this.store.selectSignal(selectSession);
  readonly ready = this.store.selectSignal(selectAuthReady);
  readonly user = this.store.selectSignal(selectUser);
  readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);

  /** Resolve khi phiên ban đầu đã được khôi phục — guard chờ cái này. */
  private resolveReady!: () => void;
  readonly whenReady = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    // Khôi phục phiên đã lưu + lắng nghe thay đổi (login/logout/refresh token).
    void this.supabase.auth.getSession().then(({ data }) => {
      this.store.dispatch(authActions.sessionChanged({ session: data.session }));
      this.store.dispatch(authActions.ready());
      this.resolveReady();
    });
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.store.dispatch(authActions.sessionChanged({ session }));
    });
  }

  /** Access token JWT hiện tại để gắn Authorization: Bearer (mục 3). */
  get accessToken(): string | null {
    return this.session()?.access_token ?? null;
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
    this.store.dispatch(authActions.sessionChanged({ session: null }));
  }

  async updateDisplayName(displayName: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      data: { display_name: displayName },
    });
    if (error) throw new Error(error.message);
  }
}
