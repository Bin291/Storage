import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PassThrough, Readable } from 'node:stream';

// @types/archiver v6 dùng conditional exports khiến default import mất call-signature
// dưới moduleResolution nodenext — nạp bằng require + khai báo interface tối thiểu.
interface ArchiverInstance {
  pipe(dest: NodeJS.WritableStream): unknown;
  on(event: 'warning' | 'error', cb: (err: Error) => void): unknown;
  append(source: Readable, opts: { name: string }): unknown;
  finalize(): Promise<void>;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createArchive = require('archiver') as (
  format: string,
  options?: { zlib?: { level?: number } },
) => ArchiverInstance;
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CacheService } from '../cache/cache.service';
import { resolveNameConflict } from '../common/name-conflict';
import { QUEUE, ZipJob } from '../jobs/queue.constants';
import { ZipStatus } from './download.service';

/**
 * Nén file/folder đã chọn thành .zip streaming (mục 5.E/11.J) — không load
 * hết vào RAM. Kết quả lưu GCS (key tạm) + presigned URL, báo trạng thái qua
 * Redis để client poll. Hỗ trợ chọn hỗn hợp nhiều file rời rạc + nhiều folder
 * cùng lúc (mục 11.J — bulk download kiểu Drive), tải 1 folder đơn chỉ là
 * trường hợp `folderIds` có đúng 1 phần tử.
 */
@Processor(QUEUE.ZIP)
export class ZipProcessor extends WorkerHost {
  private readonly logger = new Logger(ZipProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
  ) {
    super();
  }

  async process(job: Job<ZipJob>): Promise<void> {
    const { userId, jobId, fileIds, folderIds } = job.data;
    const statusKey = `zip:${userId}:${jobId}`;
    let fileCount = 0;
    try {
      const archive = createArchive('zip', { zlib: { level: 9 } });
      const pass = new PassThrough();
      archive.pipe(pass);

      const zipKey = `${userId}/_zips/${jobId}.zip`;
      const uploadPromise = this.storage.uploadStream(zipKey, pass, 'application/zip');
      archive.on('warning', (err) => this.logger.warn(err.message));

      // Tên ở GỐC zip (thư mục con của mỗi folder + tên từng file rời rạc)
      // phải khác nhau — trùng tên Explorer/Drive tự thêm hậu tố "(1)".
      const rootNames: string[] = [];

      for (const folderId of folderIds) {
        fileCount += await this.appendFolder(archive, userId, folderId, rootNames);
      }

      if (fileIds.length) {
        const files = await this.prisma.file.findMany({
          where: { userId, id: { in: fileIds }, status: 'ready', deletedAt: null },
          select: { name: true, r2Key: true },
        });
        for (const f of files) {
          const name = resolveNameConflict(f.name, rootNames);
          rootNames.push(name);
          const stream = await this.storage.getObjectStream(f.r2Key);
          archive.append(stream, { name });
          fileCount++;
        }
      }

      await archive.finalize();
      await uploadPromise;

      const url = await this.storage.presignDownload(
        zipKey,
        3600,
        `download-${new Date().toISOString().slice(0, 10)}.zip`,
        'attachment',
      );
      await this.cache.set(
        statusKey,
        { status: 'ready', url } satisfies ZipStatus,
        3600,
      );
      this.logger.log(`Zip xong (${folderIds.length} folder + ${fileIds.length} file rời): ${fileCount} tệp`);
    } catch (err) {
      await this.cache.set(
        statusKey,
        { status: 'error', error: (err as Error).message } satisfies ZipStatus,
        3600,
      );
      throw err;
    }
  }

  /** Đệ quy 1 folder vào archive dưới 1 thư mục gốc = tên folder; trả số file đã thêm. */
  private async appendFolder(
    archive: ArchiverInstance,
    userId: string,
    folderId: string,
    rootNames: string[],
  ): Promise<number> {
    // deletedAt: null -> folder đang trong Thùng rác coi như không tồn tại (mục 7.E/11.K),
    // không đóng gói vào zip cho tới khi được khôi phục.
    const root = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, deletedAt: null },
    });
    if (!root) return 0; // đã bị xoá/không thuộc user -> bỏ qua, không hỏng cả job

    const rootName = resolveNameConflict(root.name, rootNames);
    rootNames.push(rootName);

    // Dựng map folderId -> đường dẫn tương đối (tên folder lồng nhau).
    const folderIds = new Set<string>([folderId]);
    const pathById = new Map<string, string>([[folderId, rootName]]);
    let frontier = [folderId];
    while (frontier.length) {
      const kids = await this.prisma.folder.findMany({
        where: { userId, parentId: { in: frontier }, deletedAt: null },
        select: { id: true, name: true, parentId: true },
      });
      frontier = [];
      for (const k of kids) {
        folderIds.add(k.id);
        const parentPath = pathById.get(k.parentId!) ?? rootName;
        pathById.set(k.id, `${parentPath}/${k.name}`);
        frontier.push(k.id);
      }
    }

    const files = await this.prisma.file.findMany({
      where: {
        userId,
        folderId: { in: [...folderIds] },
        status: 'ready',
        deletedAt: null,
      },
      select: { name: true, r2Key: true, folderId: true },
    });
    for (const f of files) {
      const rel = pathById.get(f.folderId ?? folderId) ?? rootName;
      const stream = await this.storage.getObjectStream(f.r2Key);
      archive.append(stream, { name: `${rel}/${f.name}` });
    }
    return files.length;
  }
}
