import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme.service';
import { AccentService } from './core/accent.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Khởi tạo theme + màu nhấn sớm (đọc localStorage — mục 11.D).
  private readonly theme = inject(ThemeService);
  private readonly accent = inject(AccentService);
}
