import { Component, effect, input, signal } from '@angular/core';
import * as XLSX from 'xlsx';
import { FileSource } from '../../core/file-source';

const MAX_ROWS = 500;

/**
 * Xem trước XLSX/XLS/CSV/ODS ngay trong app (mục 11.I) — parse client-side
 * bằng SheetJS rồi tự vẽ bảng bằng token thiết kế của app (không dùng HTML
 * SheetJS tự sinh — giữ đúng "UI đặc trưng" thay vì trông như Excel xuất ra).
 */
@Component({
  selector: 'app-sheet-viewer',
  template: `
    <div class="sv-wrap">
      @if (loading()) {
        <div class="sv-state"><span class="spinner"></span> Đang đọc bảng tính…</div>
      } @else if (error()) {
        <div class="sv-state error">
          <span class="mi">error</span>
          <p>{{ error() }}</p>
        </div>
      } @else {
        @if (sheetNames().length > 1) {
          <div class="sv-tabs">
            @for (name of sheetNames(); track name) {
              <button
                type="button"
                class="sv-tab"
                [class.active]="name === activeSheet()"
                (click)="switchSheet(name)"
              >
                {{ name }}
              </button>
            }
          </div>
        }
        <div class="sv-scroll">
          <table class="sv-table">
            @if (rows().length) {
              <thead>
                <tr>
                  @for (cell of rows()[0]; track $index) {
                    <th>{{ cell }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows().slice(1); track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            }
          </table>
          @if (truncated()) {
            <p class="sv-truncated">
              Chỉ hiện {{ MAX_ROWS }} dòng đầu · tải xuống để xem đầy đủ.
            </p>
          }
          @if (rows().length === 0) {
            <div class="sv-empty">Trang tính trống.</div>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './sheet-viewer.scss',
})
export class SheetViewer {
  /** Nguồn nội dung theo ngữ cảnh quyền (mục 12.F). */
  readonly source = input.required<FileSource>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly sheetNames = signal<string[]>([]);
  readonly activeSheet = signal<string>('');
  readonly truncated = signal(false);
  readonly rows = signal<string[][]>([]);
  readonly MAX_ROWS = MAX_ROWS;

  private workbook: XLSX.WorkBook | null = null;

  constructor() {
    effect(() => {
      void this.load(this.source());
    });
  }

  /** Đổi sheet đang xem -> vẽ lại bảng từ workbook đã parse sẵn (không load lại). */
  switchSheet(name: string): void {
    this.activeSheet.set(name);
    this.renderSheet(name);
  }

  private async load(source: FileSource): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.rows.set([]);
    try {
      const blob = await source.blob();
      const buf = await blob.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      this.workbook = wb;
      this.sheetNames.set(wb.SheetNames);
      this.loading.set(false);
      if (wb.SheetNames.length) this.switchSheet(wb.SheetNames[0]);
    } catch {
      this.loading.set(false);
      this.error.set('Không đọc được bảng tính này. Thử tải xuống để mở bằng Excel.');
    }
  }

  private renderSheet(name: string): void {
    const sheet = this.workbook?.Sheets[name];
    if (!sheet) {
      this.rows.set([]);
      this.truncated.set(false);
      return;
    }
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    this.truncated.set(data.length > MAX_ROWS);
    this.rows.set(data.slice(0, MAX_ROWS));
  }
}
