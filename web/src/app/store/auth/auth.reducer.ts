import { createReducer, on } from '@ngrx/store';
import type { Session } from '@supabase/supabase-js';
import { authActions } from './auth.actions';

export interface AuthState {
  session: Session | null;
  ready: boolean;
}

export const initialAuthState: AuthState = {
  session: null,
  ready: false,
};

export const authReducer = createReducer(
  initialAuthState,
  on(authActions.sessionChanged, (state, { session }) => ({ ...state, session })),
  on(authActions.ready, (state) => ({ ...state, ready: true })),
);
