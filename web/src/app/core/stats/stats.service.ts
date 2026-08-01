import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { FileStat } from './models';
import { FILE_GROUPS, FileGroupDef, groupForExtension } from './file-groups';

export interface ExtCount {
  extension: string;
  count: number;
}

export interface GroupStat {
  def: FileGroupDef;
  count: number;
  /** Từng đuôi trong nhóm (đã sắp giảm dần theo count) để bung dropdown. */
  extensions: ExtCount[];
}

/**
 * Nguồn số đếm dùng chung cho sidebar "Theo loại" + tile Dashboard (mục 11.H).
 * Gộp raw ext-count từ GET /files/stats thành 7 nhóm ở CLIENT (mục 11.A).
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly api = inject(ApiService);

  readonly raw = signal<FileStat[]>([]);
  readonly loaded = signal(false);

  /** 7 nhóm + count + breakdown theo đuôi. */
  readonly groups = computed<GroupStat[]>(() => {
    const byGroup = new Map<string, Map<string, number>>();
    for (const g of FILE_GROUPS) byGroup.set(g.id, new Map());
    for (const { extension, count } of this.raw()) {
      const gid = groupForExtension(extension);
      const m = byGroup.get(gid)!;
      m.set(extension, (m.get(extension) ?? 0) + count);
    }
    return FILE_GROUPS.map((def) => {
      const m = byGroup.get(def.id)!;
      const extensions = [...m.entries()]
        .map(([extension, count]) => ({ extension, count }))
        .sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension));
      const count = extensions.reduce((s, e) => s + e.count, 0);
      return { def, count, extensions };
    });
  });

  /** Tổng số file (mọi loại). */
  readonly total = computed(() =>
    this.raw().reduce((s, e) => s + e.count, 0),
  );

  private inFlight = false;

  refresh(): void {
    if (this.inFlight) return;
    this.inFlight = true;
    this.api.stats().subscribe({
      next: (s) => {
        this.raw.set(s);
        this.loaded.set(true);
        this.inFlight = false;
      },
      error: () => {
        this.inFlight = false;
      },
    });
  }

  /** Gộp nhiều lần refresh gần nhau (upload nhiều file / realtime) thành 1. */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  refreshSoon(delay = 800): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.inFlight = false; // cho phép gọi lại kể cả lần trước còn treo
      this.refresh();
    }, delay);
  }
}
