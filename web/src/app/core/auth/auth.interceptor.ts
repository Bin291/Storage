import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

/**
 * Gắn Authorization: Bearer <supabase jwt> cho mọi request tới API NestJS.
 * Không gắn cho request đi thẳng lên GCS (presigned URL đã tự chứa chữ ký).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const isApiCall = req.url.startsWith(environment.apiBaseUrl);
  if (token && isApiCall) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req);
};
