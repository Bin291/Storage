import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Theme sáng/tối/theo thiết bị — lưu ở localStorage, không có bảng DB (mục 11.D).
 * Áp bằng thuộc tính data-theme trên <html> (tokens ở _tokens.scss).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly key = 'storage-app.theme';
  readonly mode = signal<ThemeMode>(this.load());

  private media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.apply(this.mode());
    this.media.addEventListener('change', () => {
      if (this.mode() === 'system') this.apply('system');
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(this.key, mode);
    this.apply(mode);
  }

  private load(): ThemeMode {
    const saved = localStorage.getItem(this.key) as ThemeMode | null;
    return saved ?? 'system';
  }

  private apply(mode: ThemeMode): void {
    const dark = mode === 'dark' || (mode === 'system' && this.media.matches);
    document.documentElement.setAttribute(
      'data-theme',
      dark ? 'dark' : 'light',
    );
  }
}
