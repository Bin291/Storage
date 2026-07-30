import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { Session } from '@supabase/supabase-js';

/** Phiên Supabase thay đổi (đăng nhập/đăng xuất/refresh token) — nguồn là AuthService. */
export const authActions = createActionGroup({
  source: 'Auth',
  events: {
    'Session Changed': props<{ session: Session | null }>(),
    Ready: emptyProps(),
  },
});
