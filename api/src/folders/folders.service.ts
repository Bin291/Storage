import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Folder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';
import { resolveNameConflict } from '../common/name-conflict';
import { CleanupJob, QUEUE } from '../jobs/queue.constants';

export interface BreadcrumbNode {
  id: string;
  name: string;
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE.CLEANUP) private readonly cleanupQueue: Queue<CleanupJob>,
  ) {}

  private listCacheKey(userId: string): string {
    return `folders:${userId}:*`;
  }

  private async invalidate(userId: string): Promise<void> {
    await this.cache.delByPattern(`folders:${userId}:*`);
    await this.cache.delByPattern(`files:${userId}:*`);
  }

  /** Tên các folder con hiện có (để xử lý trùng tên — mục 2.1). */
  private async siblingFolderNames(
    userId: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<string[]> {
    const rows = await this.prisma.folder.findMany({
      where: {
        userId,
        parentId,
        deletedAt: null, // item trong Thùng rác không tính là "đang chiếm tên" (mục 7.E/11.K)
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  private async assertOwned(userId: string, folderId: string): Promise<Folder> {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId },
    });
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
    return folder;
  }

  async create(
    userId: string,
    name: string,
    parentId: string | null | undefined,
  ): Promise<Folder> {
    const pid = parentId ?? null;
    if (pid) await this.assertOwned(userId, pid); // parent phải thuộc user
    const finalName = resolveNameConflict(
      name.trim(),
      await this.siblingFolderNames(userId, pid),
    );
    const folder = await this.prisma.folder.create({
      data: { name: finalName, parentId: pid, userId },
    });
    await this.invalidate(userId);
    return folder;
  }

  /** Con trực tiếp của 1 node (lazy load sidebar — mục 11.C). */
  async children(
    userId: string,
    parentId: string | null,
  ): Promise<Folder[]> {
    return this.prisma.folder.findMany({
      where: { userId, parentId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  /** Breadcrumb: lần theo parentId ngược lên gốc (mục 11.C). */
  async breadcrumb(
    userId: string,
    folderId: string,
  ): Promise<BreadcrumbNode[]> {
    const path: BreadcrumbNode[] = [];
    let current: string | null = folderId;
    const guard = new Set<string>();
    while (current) {
      if (guard.has(current)) break; // chống vòng lặp bất thường
      guard.add(current);
      const f: Folder | null = await this.prisma.folder.findFirst({
        where: { id: current, userId },
      });
      if (!f) break;
      path.unshift({ id: f.id, name: f.name });
      current = f.parentId;
    }
    return path;
  }

  async rename(
    userId: string,
    folderId: string,
    name: string,
  ): Promise<Folder> {
    const folder = await this.assertOwned(userId, folderId);
    const finalName = resolveNameConflict(
      name.trim(),
      await this.siblingFolderNames(userId, folder.parentId, folderId),
    );
    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: { name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  async move(
    userId: string,
    folderId: string,
    newParentId: string | null,
  ): Promise<Folder> {
    const folder = await this.assertOwned(userId, folderId);
    if (newParentId) {
      if (newParentId === folderId) {
        throw new BadRequestException('Không thể chuyển thư mục vào chính nó');
      }
      await this.assertOwned(userId, newParentId);
      // Chặn chuyển vào chính con cháu của nó (tạo vòng).
      const descendants = await this.collectDescendantFolderIds(userId, folderId);
      if (descendants.has(newParentId)) {
        throw new BadRequestException(
          'Không thể chuyển thư mục vào thư mục con của nó',
        );
      }
    }
    const finalName = resolveNameConflict(
      folder.name,
      await this.siblingFolderNames(userId, newParentId, folderId),
    );
    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: { parentId: newParentId, name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  async setStar(
    userId: string,
    folderId: string,
    isStarred: boolean,
  ): Promise<Folder> {
    await this.assertOwned(userId, folderId);
    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: { isStarred },
    });
    await this.invalidate(userId);
    return updated;
  }

  /** Tập id mọi folder con cháu (gồm cả chính nó). */
  private async collectDescendantFolderIds(
    userId: string,
    rootId: string,
  ): Promise<Set<string>> {
    const ids = new Set<string>([rootId]);
    let frontier = [rootId];
    while (frontier.length) {
      const kids = await this.prisma.folder.findMany({
        where: { userId, parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = [];
      for (const k of kids) {
        if (!ids.has(k.id)) {
          ids.add(k.id);
          frontier.push(k.id);
        }
      }
    }
    return ids;
  }

  /**
   * Xoá mềm — vào Thùng rác (mục 7.E giai đoạn 1 / 11.K). Cascade `deletedAt`
   * xuống TOÀN BỘ folder/file con cùng thời điểm — nhờ vậy mọi query list chỉ
   * cần `WHERE deletedAt IS NULL`, không cần kiểm tra đệ quy tổ tiên. Thùng
   * rác chỉ hiện "trash root" (folder này), không rã cây hiện từng con.
   */
  async trash(userId: string, folderId: string): Promise<void> {
    await this.assertOwned(userId, folderId);
    const folderIds = await this.collectDescendantFolderIds(userId, folderId);
    const now = new Date();
    await this.prisma.folder.updateMany({
      where: { id: { in: [...folderIds] } },
      data: { deletedAt: now },
    });
    await this.prisma.file.updateMany({
      where: { userId, folderId: { in: [...folderIds] } },
      data: { deletedAt: now },
    });
    await this.invalidate(userId);
  }

  /**
   * Khôi phục từ Thùng rác (mục 7.E) — clear `deletedAt` cho cả cây con (đối
   * xứng với bước cascade lúc xoá mềm), áp lại quy tắc trùng tên (mục 2.1)
   * cho chính folder gốc tại vị trí cũ.
   */
  async restore(userId: string, folderId: string): Promise<Folder> {
    const folder = await this.assertOwned(userId, folderId);
    const folderIds = await this.collectDescendantFolderIds(userId, folderId);
    const finalName = resolveNameConflict(
      folder.name,
      await this.siblingFolderNames(userId, folder.parentId, folderId),
    );
    await this.prisma.folder.updateMany({
      where: { id: { in: [...folderIds] } },
      data: { deletedAt: null },
    });
    await this.prisma.file.updateMany({
      where: { userId, folderId: { in: [...folderIds] } },
      data: { deletedAt: null },
    });
    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: { name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  /**
   * Xoá vĩnh viễn (mục 7.E giai đoạn 2) — chỉ hợp lệ khi folder ĐÃ ở Thùng
   * rác. Đánh dấu delete_pending → gom mọi r2Key con → enqueue job dọn GCS
   * trước rồi hard-delete DB (cascade).
   */
  async hardDelete(userId: string, folderId: string): Promise<void> {
    const folder = await this.assertOwned(userId, folderId);
    if (!folder.deletedAt) {
      throw new BadRequestException(
        'Chỉ xoá vĩnh viễn được thư mục đã ở trong Thùng rác',
      );
    }
    const folderIds = await this.collectDescendantFolderIds(userId, folderId);

    // Đánh dấu delete_pending để ẩn khỏi UI ngay.
    await this.prisma.folder.updateMany({
      where: { id: { in: [...folderIds] } },
      data: { status: 'delete_pending' },
    });

    // Gom r2Key mọi file con (gốc + thumbnail + artifact).
    const files = await this.prisma.file.findMany({
      where: { userId, folderId: { in: [...folderIds] } },
      select: { id: true, r2Key: true },
    });
    const r2Keys: string[] = [];
    for (const f of files) {
      r2Keys.push(f.r2Key);
      r2Keys.push(this.storage.thumbnailKey(userId, f.id));
      r2Keys.push(this.storage.artifactKey(userId, f.id));
    }
    await this.prisma.file.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { status: 'delete_pending' },
    });

    await this.invalidate(userId);
    await this.cleanupQueue.add('cleanup-folder', {
      type: 'folder',
      userId,
      targetId: folderId,
      r2Keys,
    });
  }
}
