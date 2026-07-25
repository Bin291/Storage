import { Injectable, signal } from '@angular/core';

export interface AccentPreset {
  id: string;
  label: string;
  base: string; // màu nhấn chính
  strong: string; // trạng thái active/hover đậm hơn
  on: string; // màu chữ trên nền nhấn
}

/**
 * Màu nhấn cá nhân hoá (mục 11.D — cá nhân hoá).
 * Mặc định Signal Blue (#0071E3) theo DESIGN.md. Ghi ra biến CSS toàn cục:
 * --c-accent / --c-accent-strong / --c-accent-soft / --c-on-accent.
 */
@Injectable({ providedIn: 'root' })
export class AccentService {
  private readonly key = 'storage-app.accent';

  readonly presets: AccentPreset[] = [
    { id: 'blue', label: 'Signal Blue', base: '#0071e3', strong: '#0059b3', on: '#ffffff' },
    { id: 'indigo', label: 'Indigo', base: '#6e56cf', strong: '#584bb0', on: '#ffffff' },
    { id: 'teal', label: 'Teal', base: '#0d9488', strong: '#0b756c', on: '#ffffff' },
    { id: 'green', label: 'Green', base: '#16a34a', strong: '#12823c', on: '#ffffff' },
    { id: 'amber', label: 'Amber', base: '#d97706', strong: '#b45f04', on: '#ffffff' },
    { id: 'rose', label: 'Rose', base: '#e11d48', strong: '#be123c', on: '#ffffff' },
    { id: 'graphite', label: 'Graphite', base: '#1d1d1f', strong: '#000000', on: '#ffffff' },
  ];

  readonly current = signal<string>(this.load());

  constructor() {
    this.apply(this.current());
  }

  set(id: string): void {
    if (!this.presets.some((p) => p.id === id)) return;
    this.current.set(id);
    localStorage.setItem(this.key, id);
    this.apply(id);
  }

  private load(): string {
    return localStorage.getItem(this.key) ?? 'blue';
  }

  private apply(id: string): void {
    const p = this.presets.find((x) => x.id === id) ?? this.presets[0];
    const root = document.documentElement.style;
    root.setProperty('--c-accent', p.base);
    root.setProperty('--c-accent-strong', p.strong);
    root.setProperty('--c-accent-soft', this.rgba(p.base, 0.1));
    root.setProperty('--c-accent-ring', this.rgba(p.base, 0.35));
    root.setProperty('--c-on-accent', p.on);
  }

  /** Chuyển hex -> rgba(alpha) để làm nền mờ / vòng focus. */
  private rgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
