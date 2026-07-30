import { createFeatureSelector, createSelector } from '@ngrx/store';
import type { User } from '@supabase/supabase-js';
import { AuthState } from './auth.reducer';

export const selectAuthState = createFeatureSelector<AuthState>('auth');

export const selectSession = createSelector(selectAuthState, (s) => s.session);
export const selectAuthReady = createSelector(selectAuthState, (s) => s.ready);
export const selectUser = createSelector(
  selectSession,
  (session): User | null => session?.user ?? null,
);
export const selectIsAuthenticated = createSelector(selectSession, (session) => !!session);
