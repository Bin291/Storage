import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { File, Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';
import { CacheService } from '../infra/cache/cache.service';
import { StorageService } from '../storage/storage.service';
import { resolveNameConflict } from '../infra/common/name-conflict';
import { extensionsForCategory } from '../infra/common/file-categories';
import { CleanupJob, QUEUE } from '../jobs/queue.constants';
import { ListFilesQuery } from './dto';

export interface BreadcrumbNode {
  id: string;
  name: string;
}

/** File kèm đường dẫn folder cha (chỉ ở lăng kính cắt-ngang-folder — mục 11.H). */
export type FileWithPath = File & { folderPath?: BreadcrumbNode[] };

export interface FileListResult {
  files: FileWithPath[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FileStat {
  extension: string;
  count: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE.CLEANUP) private readonly cleanupQueue: Queue<CleanupJob>,
  ) {}

  private async invalidate(userId: string): Promise<void> {
    await this.cache.delByPattern(`files:${userId}:*`);
  }

  private async assertOwned(userId: string, fileId: string): Promise<File> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    return file;
  }

  private async siblingFileNames(
    userId: string,
    folderId: string | null,
    excludeId?: string,
  ): Promise<string[]> {
    const rows = await this.prisma.file.findMany({
      where: {
        userId,
        folderId,
        deletedAt: null, // item trong Thùng rác không tính là "đang chiếm tên" (mục 7.E/11.K)
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  async list(userId: string, q: ListFilesQuery): Promise<FileListResult> {
    const where: Prisma.FileWhereInput = {
      userId,
      deletedAt: null, // ẩn file trong Thùng rác khỏi mọi view duyệt bình thường (mục 7.E/11.K)
    };

    // Đuôi file yêu cầu (lăng kính Loại — mục 11.H): "pdf,docx" -> ['pdf','docx'].
    const exts = (q.extensions ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    // Tìm theo tên: cũng cắt ngang folder (tìm trong toàn bộ kho, không chỉ
    // thư mục đang mở) — nếu không thì gõ tên tệp ở thư mục khác sẽ không ra.
    const nameQuery = (q.q ?? '').trim();

    // Các lăng kính CẮT NGANG mọi folder (mục 11.H): Loại (có extensions),
    // Gần đây, và tìm theo tên. Không ràng buộc folderId, đính kèm folderPath.
    const crossFolder = exts.length > 0 || !!q.recent || nameQuery.length > 0;

    if (nameQuery) {
      where.name = { contains: nameQuery, mode: 'insensitive' };
      if (exts.length) where.extension = { in: exts };
    } else if (crossFolder) {
      if (exts.length) where.extension = { in: exts };
    } else if (q.starred) {
      where.isStarred = true;
    } else {
      where.folderId = q.folderId ?? null;
      if (q.category) {
        const catExts = extensionsForCategory(q.category);
        if (catExts) where.extension = { in: catExts };
      }
    }

    const orderBy: Prisma.FileOrderByWithRelationInput = {
      [q.sort]: q.order,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.file.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.file.count({ where }),
    ]);

    let files: FileWithPath[] = rows;
    if (crossFolder) {
      const map = await this.folderMap(userId);
      files = rows.map((f) => ({
        ...f,
        folderPath: this.pathFor(map, f.folderId),
      }));
    }
    return { files, total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Số đếm theo đuôi file cho sidebar & tile Dashboard (mục 11.H).
   * Cache Redis key `files:{userId}:stats` (được invalidate() dọn khi ghi) + TTL 60s.
   */
  async stats(userId: string): Promise<FileStat[]> {
    return this.cache.wrap(`files:${userId}:stats`, 60, async () => {
      const grouped = await this.prisma.file.groupBy({
        by: ['extension'],
        where: { userId, deletedAt: null },
        _count: { _all: true },
      });
      return grouped.map((g) => ({
        extension: g.extension,
        count: g._count._all,
      }));
    });
  }

  /**
   * Map folder của user (id -> {name, parentId}) để lần breadcrumb per-file rẻ
   * ở lăng kính cắt-ngang-folder (mục 11.H — MVP: nạp 1 lần, cache Redis).
   * Key nằm dưới `folders:{userId}:*` nên tự bị dọn khi tạo/xoá/rename/move folder.
   */
  private async folderMap(
    userId: string,
  ): Promise<Record<string, { name: string; parentId: string | null }>> {
    return this.cache.wrap(`folders:${userId}:map`, 60, async () => {
      const rows = await this.prisma.folder.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, name: true, parentId: true },
      });
      const map: Record<string, { name: string; parentId: string | null }> = {};
      for (const r of rows) map[r.id] = { name: r.name, parentId: r.parentId };
      return map;
    });
  }

  /** Lần parentId ngược lên gốc -> [{id,name}] từ gốc tới folder cha trực tiếp. */
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

  async getById(userId: string, fileId: string): Promise<File> {
    return this.assertOwned(userId, fileId);
  }

  /** Tổng dung lượng đã dùng (mục 11.E) — cache ngắn qua Redis. */
  async usage(userId: string): Promise<{ totalBytes: string; count: number }> {
    return this.cache.wrap(`files:${userId}:usage`, 60, async () => {
      const agg = await this.prisma.file.aggregate({
        where: { userId, status: { not: 'delete_pending' } },
        _sum: { size: true },
        _count: true,
      });
      return {
        totalBytes: (agg._sum.size ?? 0n).toString(),
        count: agg._count,
      };
    });
  }

  /** Tạo row File trạng thái 'uploading' trước khi bắt đầu multipart (mục 5.A/7.A). */
  async createPending(
    userId: string,
    data: {
      name: string;
      extension: string;
      mimeType: string;
      size: bigint;
      folderId: string | null;
    },
  ): Promise<File> {
    if (data.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: data.folderId, userId },
      });
      if (!folder) throw new NotFoundException('Thư mục không tồn tại');
    }
    const finalName = resolveNameConflict(
      data.name.trim(),
      await this.siblingFileNames(userId, data.folderId),
    );
    // r2Key phải là "{userId}/{fileId}" nên tạo id trước bằng crypto.randomUUID.
    const id = crypto.randomUUID();
    const file = await this.prisma.file.create({
      data: {
        id,
        name: finalName,
        extension: data.extension.toLowerCase(),
        mimeType: data.mimeType,
        size: data.size,
        userId,
        folderId: data.folderId,
        r2Key: `${userId}/${id}`,
        status: 'uploading',
      },
    });
    await this.invalidate(userId);
    return file;
  }

  async markStatus(
    userId: string,
    fileId: string,
    status: string,
    errorMessage?: string | null,
  ): Promise<File> {
    await this.assertOwned(userId, fileId);
    const file = await this.prisma.file.update({
      where: { id: fileId },
      data: { status, errorMessage: errorMessage ?? null },
    });
    await this.invalidate(userId);
    return file;
  }

  async rename(userId: string, fileId: string, name: string): Promise<File> {
    const file = await this.assertOwned(userId, fileId);
    const finalName = resolveNameConflict(
      name.trim(),
      await this.siblingFileNames(userId, file.folderId, fileId),
    );
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  async move(
    userId: string,
    fileId: string,
    newFolderId: string | null,
  ): Promise<File> {
    const file = await this.assertOwned(userId, fileId);
    if (newFolderId) {
      const target = await this.prisma.folder.findFirst({
        where: { id: newFolderId, userId },
      });
      if (!target) throw new NotFoundException('Thư mục đích không tồn tại');
    }
    const finalName = resolveNameConflict(
      file.name,
      await this.siblingFileNames(userId, newFolderId, fileId),
    );
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { folderId: newFolderId, name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  /**
   * Sao chép 1 tệp sang thư mục khác (mục 11.N — Sao chép/Dán).
   *
   * Khác `move()` ở chỗ tạo BẢN SAO THẬT: object mới trên GCS + row mới trong DB
   * ⇒ **tốn thêm dung lượng đúng bằng kích thước tệp**. Byte được copy
   * server-side trên GCS nên không đi qua Cloud Run.
   *
   * Chép luôn cả `DocumentChunk` (text + vector) thay vì đẩy lại job AI: nội dung
   * y hệt bản gốc nên embedding cũng y hệt — chép row rẻ hơn nhiều so với gọi lại
   * Gemini, và bản sao tìm được ngay bằng AI search chứ không phải chờ xử lý.
   */
  async copy(
    userId: string,
    fileId: string,
    targetFolderId: string | null,
  ): Promise<File> {
    const src = await this.assertOwned(userId, fileId);
    if (src.deletedAt) {
      throw new BadRequestException('Tệp đang ở Thùng rác, không sao chép được');
    }
    if (src.status !== 'ready') {
      throw new BadRequestException(
        'Chỉ sao chép được tệp đã xử lý xong (trạng thái "sẵn sàng")',
      );
    }
    if (targetFolderId) {
      const target = await this.prisma.folder.findFirst({
        where: { id: targetFolderId, userId, deletedAt: null },
      });
      if (!target) throw new NotFoundException('Thư mục đích không tồn tại');
    }

    const id = crypto.randomUUID();
    const destKey = this.storage.buildKey(userId, id);
    // Object gốc PHẢI copy được, nếu lỗi thì ném luôn — không tạo row trỏ vào
    // object không tồn tại. Thumbnail/artifact thì best-effort (có thể chưa sinh).
    await this.storage.copyObject(src.r2Key, destKey);

    let thumbnailUrl: string | null = null;
    const thumbCopied = await this.storage.copyObject(
      this.storage.thumbnailKey(userId, src.id),
      this.storage.thumbnailKey(userId, id),
    );
    if (thumbCopied) {
      thumbnailUrl = await this.storage.presignDownload(
        this.storage.thumbnailKey(userId, id),
        7 * 24 * 3600,
      );
    }
    await this.storage.copyObject(
      this.storage.artifactKey(userId, src.id),
      this.storage.artifactKey(userId, id),
    );

    const finalName = resolveNameConflict(
      src.name,
      await this.siblingFileNames(userId, targetFolderId),
    );

    const created = await this.prisma.file.create({
      data: {
        id,
        name: finalName,
        extension: src.extension,
        r2Key: destKey,
        thumbnailUrl,
        size: src.size,
        userId,
        folderId: targetFolderId,
        status: 'ready',
      },
    });

    // Chép vector sang bản sao (raw SQL vì cột `embedding` là Unsupported("vector")
    // — Prisma Client không đọc/ghi được kiểu này qua API thường, mục 7.B).
    await this.prisma.$executeRaw`
      insert into "DocumentChunk" ("id", "fileId", "content", "chunkIndex", "embedding")
      select gen_random_uuid(), ${created.id}, dc."content", dc."chunkIndex", dc."embedding"
      from "DocumentChunk" dc
      where dc."fileId" = ${src.id}
    `;

    await this.invalidate(userId);
    return created;
  }

  async setStar(
    userId: string,
    fileId: string,
    isStarred: boolean,
  ): Promise<File> {
    await this.assertOwned(userId, fileId);
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isStarred },
    });
    await this.invalidate(userId);
    return updated;
  }

  /**
   * Xoá mềm — vào Thùng rác (mục 7.E giai đoạn 1 / 11.K).
   * Chỉ đổi `deletedAt`, KHÔNG đụng GCS — khôi phục được bất cứ lúc nào.
   */
  async trash(userId: string, fileId: string): Promise<File> {
    const file = await this.assertOwned(userId, fileId);
    if (file.deletedAt) return file; // đã ở trong Thùng rác — no-op
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });
    await this.invalidate(userId);
    return updated;
  }

  /**
   * Khôi phục từ Thùng rác (mục 7.E). Áp lại quy tắc trùng tên kiểu Windows
   * Explorer (mục 2.1) — chỗ cũ có thể đã có file/folder khác trùng tên.
   */
  async restore(userId: string, fileId: string): Promise<File> {
    const file = await this.assertOwned(userId, fileId);
    if (!file.deletedAt) return file; // không ở trong Thùng rác — no-op
    const finalName = resolveNameConflict(
      file.name,
      await this.siblingFileNames(userId, file.folderId, fileId),
    );
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: null, name: finalName },
    });
    await this.invalidate(userId);
    return updated;
  }

  /**
   * Xoá vĩnh viễn (mục 7.E giai đoạn 2) — chỉ hợp lệ khi file ĐÃ ở Thùng rác
   * (qua trash() trước, hoặc job quét hết hạn — mục 11.K). delete_pending →
   * enqueue dọn GCS (gốc+thumb+artifact) → xoá DB.
   */
  async hardDelete(userId: string, fileId: string): Promise<void> {
    const file = await this.assertOwned(userId, fileId);
    if (!file.deletedAt) {
      throw new BadRequestException(
        'Chỉ xoá vĩnh viễn được file đã ở trong Thùng rác',
      );
    }
    await this.prisma.file.update({
      where: { id: fileId },
      data: { status: 'delete_pending' },
    });
    await this.invalidate(userId);
    await this.cleanupQueue.add('cleanup-file', {
      type: 'file',
      userId,
      targetId: fileId,
      r2Keys: [
        file.r2Key,
        this.storage.thumbnailKey(userId, fileId),
        this.storage.artifactKey(userId, fileId),
      ],
    });
  }
}
