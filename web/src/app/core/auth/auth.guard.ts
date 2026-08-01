import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Chặn route nếu chưa đăng nhập, chờ khôi phục phiên trước khi quyết định. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

/** Ngược lại: nếu đã đăng nhập thì không cho vào trang login. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady;
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/app']);
};
