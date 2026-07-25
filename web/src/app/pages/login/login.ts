import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'signin' | 'signup'>('signin');
  readonly email = signal('');
  readonly password = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  toggleMode(): void {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
    this.error.set(null);
    this.notice.set(null);
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    this.error.set(null);
    this.notice.set(null);
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.error.set('Vui lòng nhập email và mật khẩu.');
      return;
    }
    this.loading.set(true);
    try {
      if (this.mode() === 'signin') {
        await this.auth.signInWithPassword(email, password);
        await this.router.navigate(['/']);
      } else {
        const { needsConfirm } = await this.auth.signUp(email, password);
        if (needsConfirm) {
          this.notice.set(
            'Đã gửi email xác nhận. Kiểm tra hộp thư rồi đăng nhập.',
          );
          this.mode.set('signin');
        } else {
          await this.router.navigate(['/']);
        }
      }
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
