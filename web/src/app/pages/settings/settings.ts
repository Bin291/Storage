import { Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { ThemeService, ThemeMode } from '../../core/theme.service';
import { AccentService } from '../../core/accent.service';
import { AuthService } from '../../core/auth.service';
import {
  ViewPrefsService,
  Density,
  ViewMode,
} from '../../core/view-prefs.service';
import { SortField, SortOrder } from '../../core/models';

// Cài đặt cá nhân hoá — lưu ở localStorage (mục 11.D). Áp dụng live toàn app.
@Component({
  selector: 'app-settings',
  imports: [RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly theme = inject(ThemeService);
  readonly accent = inject(AccentService);
  readonly prefs = inject(ViewPrefsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  readonly themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: 'Sáng', icon: 'light_mode' },
    { value: 'dark', label: 'Tối', icon: 'dark_mode' },
    { value: 'system', label: 'Theo thiết bị', icon: 'desktop_windows' },
  ];
  readonly densityOptions: { value: Density; label: string }[] = [
    { value: 'comfortable', label: 'Thoáng' },
    { value: 'compact', label: 'Gọn' },
  ];
  readonly viewOptions: { value: ViewMode; label: string; icon: string }[] = [
    { value: 'grid', label: 'Lưới', icon: 'grid_view' },
    { value: 'list', label: 'Danh sách', icon: 'view_list' },
  ];
  readonly sortOptions: { value: SortField; label: string }[] = [
    { value: 'name', label: 'Tên' },
    { value: 'updatedAt', label: 'Ngày sửa' },
    { value: 'size', label: 'Dung lượng' },
  ];
  readonly orderOptions: { value: SortOrder; label: string }[] = [
    { value: 'asc', label: 'Tăng dần' },
    { value: 'desc', label: 'Giảm dần' },
  ];

  setSort(v: SortField): void {
    this.prefs.defaultSort.set(v);
  }
  setOrder(v: SortOrder): void {
    this.prefs.defaultOrder.set(v);
  }
  setView(v: ViewMode): void {
    this.prefs.mode.set(v);
  }
  setDensity(v: Density): void {
    this.prefs.density.set(v);
  }

  toggleNotify(): void {
    const next = !this.prefs.notifyOnDone();
    if (
      next &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission();
    }
    this.prefs.notifyOnDone.set(next);
  }
}
