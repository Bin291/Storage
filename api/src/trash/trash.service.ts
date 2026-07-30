import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infra/prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { FoldersService } from '../folders/folders.service';

export interface BreadcrumbNode {
  id: string;
  name: string;
}

export interface TrashItem {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  size: string | null;
  deletedAt: string;
  daysUntilPurge: number;
  folderPath: BreadcrumbNode[];
}

/**
 * Thùng rác (mục 7.E / 11.K) — hợp nhất trash root của File + Folder.
 * Chỉ hiện "trash root" (item bị xoá trực tiếp), KHÔNG rã cây hiện từng
 * file/folder con bị cascade theo — giống hành vi Google Drive.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly filesService: FilesService,
    private readonly foldersService: FoldersService,
  ) {}

  private retentionDays(): number {
    return this.config.get<number>('trash.retentionDays') ?? 30;
  }

  /** Map folder ĐANG ACTIVE của user (id -> {name, parentId}) để lần breadcrumb. */
  private async activeFolderMap(
    userId: string,
  ): Promise<Record<string, { name: string; parentId: string | null }>> {
    const rows = await this.prisma.folder.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, name: true, parentId: true },
    });
    const map: Record<string, { name: string; parentId: string | null }> = {};
    for (const r of rows) map[r.id] = { name: r.name, parentId: r.parentId };
    return map;
  }

  private pathFor(
    map: Record<string, { name: string; parentId: string | null }>,
    folderId: string | null,
  ): BreadcrumbNode[] {
    const path: BreadcrumbNode[] = [];
    let cur = folderId;
    const guard = new Set<string>();
    while (cur && map[cur] && !guard.has(cur)) {
      guard.add(cur);
      path.unshift({ id: cur, name: map[cur].name });
      cur = map[cur].parentId;
    }
    return path;
  }

  private daysUntilPurge(deletedAt: Date, retentionDays: number): number {
    const ageDays = Math.floor(
      (Date.now() - deletedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    return Math.max(0, retentionDays - ageDays);
  }

  /** List trash root của 1 user, mới xoá lên đầu (mục 11.K). */
  async list(userId: string): Promise<TrashItem[]> {
    const days = this.retentionDays();
    const map = await this.activeFolderMap(userId);

    const trashedFiles = await this.prisma.file.findMany({
      where: { userId, deletedAt: { not: null }, status: { not: 'delete_pending' } },
      include: { folder: { select: { deletedAt: true } } },
    });
    const trashedFolders = await this.prisma.folder.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { parent: { select: { deletedAt: true } } },
    });

    const items: TrashItem[] = [];
    for (const f of trashedFiles) {
      // Con bị cascade (cha cũng đang trash) -> không phải trash root, ẩn khỏi list.
      if (f.folder && f.folder.deletedAt !== null) continue;
      items.push({
        kind: 'file',
        id: f.id,
        name: f.name,
        extension: f.extension,
        size: f.size.toString(),
        deletedAt: f.deletedAt!.toISOString(),
        daysUntilPurge: this.daysUntilPurge(f.deletedAt!, days),
        folderPath: this.pathFor(map, f.folderId),
      });
    }
    for (const d of trashedFolders) {
      if (d.parent && d.parent.deletedAt !== null) continue;
      items.push({
        kind: 'folder',
        id: d.id,
        name: d.name,
        extension: null,
        size: null,
        deletedAt: d.deletedAt!.toISOString(),
        daysUntilPurge: this.daysUntilPurge(d.deletedAt!, days),
        folderPath: this.pathFor(map, d.parentId),
      });
    }
    items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return items;
  }

  /** Xoá vĩnh viễn toàn bộ Thùng rác của 1 user (nút "Dọn thùng rác" — mục 11.K). */
  async emptyTrash(userId: string): Promise<{ count: number }> {
    const items = await this.list(userId);
    for (const it of items) {
      if (it.kind === 'file') await this.filesService.hardDelete(userId, it.id);
      else await this.foldersService.hardDelete(userId, it.id);
    }
    return { count: items.length };
  }

  /**
   * Job định kỳ (mục 7.E giai đoạn 2 / 11.K) — quét TOÀN HỆ THỐNG (mọi user),
   * xoá vĩnh viễn mọi trash root đã quá `TRASH_RETENTION_DAYS`.
   */
  async purgeExpired(): Promise<number> {
    const days = this.retentionDays();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trashedFiles = await this.prisma.file.findMany({
      where: { deletedAt: { lte: cutoff }, status: { not: 'delete_pending' } },
      include: { folder: { select: { deletedAt: true } } },
    });
    const trashedFolders = await this.prisma.folder.findMany({
      where: { deletedAt: { lte: cutoff } },
      include: { parent: { select: { deletedAt: true } } },
    });

    const fileRoots = trashedFiles.filter(
      (f) => !f.folder || f.folder.deletedAt === null,
    );
    const folderRoots = trashedFolders.filter(
      (d) => !d.parent || d.parent.deletedAt === null,
    );

    for (const f of fileRoots) await this.filesService.hardDelete(f.userId, f.id);
    for (const d of folderRoots) await this.foldersService.hardDelete(d.userId, d.id);
    return fileRoots.length + folderRoots.length;
  }
}
