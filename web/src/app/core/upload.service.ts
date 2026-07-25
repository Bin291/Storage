import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import imageCompression from 'browser-image-compression';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { NavEventsService } from './nav-events.service';

export interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number; // 0-100
  status: 'preparing' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

interface PendingSession {
  fileId: string;
  uploadId: string;
  key: string;
  partSize: number;
}

/**
 * Chunked multipart upload resumable (mục 5.A) + nén ảnh client-side (mục 4.A).
 * Chunk đi THẲNG lên R2 qua presigned URL (fetch), không qua backend.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly api = inject(ApiService);
  private readonly navEvents = inject(NavEventsService);
  private readonly pendingKey = 'storage-app.pendingUploads';
  private readonly chunkSize = environment.uploadChunkSize;
  private readonly concurrency = environment.uploadConcurrency;

  readonly tasks = signal<UploadTask[]>([]);
  /** Bắn ra khi 1 file hoàn tất để trang gọi reload. */
  readonly completed = signal(0);

  private updateTask(id: string, patch: Partial<UploadTask>): void {
    this.tasks.update((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }

  clearDone(): void {
    this.tasks.update((l) =>
      l.filter((t) => t.status !== 'done' && t.status !== 'error'),
    );
  }

  // --- localStorage resume state ---
  private loadPending(): Record<string, PendingSession> {
    try {
      return JSON.parse(localStorage.getItem(this.pendingKey) || '{}');
    } catch {
      return {};
    }
  }
  private savePending(map: Record<string, PendingSession>): void {
    localStorage.setItem(this.pendingKey, JSON.stringify(map));
  }
  private fingerprint(file: File, folderId: string | null): string {
    return `${folderId ?? 'root'}:${file.name}:${file.size}:${file.lastModified}`;
  }

  // --- Public API ---

  async uploadFiles(files: File[], folderId: string | null): Promise<void> {
    for (const file of files) {
      await this.uploadOne(file, folderId);
    }
  }

  /** Xử lý drop có thể chứa folder (mục 2.1): đọc đệ quy qua webkitGetAsEntry. */
  async uploadDataTransfer(
    items: DataTransferItem[],
    folderId: string | null,
  ): Promise<void> {
    const entries: FileSystemEntry[] = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length === 0) return;
    const queue: { file: File; folderId: string | null }[] = [];
    for (const entry of entries) {
      await this.collectEntry(entry, folderId, queue);
    }
    for (const q of queue) {
      await this.uploadOne(q.file, q.folderId);
    }
    if (entries.some((e) => e.isDirectory)) this.navEvents.bumpFolders();
  }

  /**
   * Picker folder dự phòng (input webkitdirectory — mục 2.1/11.H): trình
   * duyệt không cấp FileSystemEntry ở đây, chỉ có `webkitRelativePath` phẳng
   * trên từng File -> tự dựng lại cây con bằng cách tạo folder theo từng đoạn
   * đường dẫn rồi upload file vào đúng chỗ.
   */
  async uploadFolderPicker(files: File[], baseFolderId: string | null): Promise<void> {
    const folderCache = new Map<string, string | null>();
    folderCache.set('', baseFolderId);
    for (const file of files) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split('/');
      parts.pop(); // bỏ tên file
      let path = '';
      let parentId = baseFolderId;
      for (const seg of parts) {
        const next = path ? `${path}/${seg}` : seg;
        if (!folderCache.has(next)) {
          const created = await firstValueFrom(this.api.createFolder(seg, parentId));
          folderCache.set(next, created.id);
        }
        parentId = folderCache.get(next)!;
        path = next;
      }
      await this.uploadOne(file, parentId);
    }
    this.navEvents.bumpFolders();
  }

  private async collectEntry(
    entry: FileSystemEntry,
    parentFolderId: string | null,
    queue: { file: File; folderId: string | null }[],
  ): Promise<void> {
    if (entry.isFile) {
      const file = await this.entryToFile(entry as FileSystemFileEntry);
      queue.push({ file, folderId: parentFolderId });
    } else if (entry.isDirectory) {
      // Tạo folder tương ứng rồi đệ quy vào trong.
      const created = await firstValueFrom(
        this.api.createFolder(entry.name, parentFolderId),
      );
      const children = await this.readAllEntries(
        (entry as FileSystemDirectoryEntry).createReader(),
      );
      for (const child of children) {
        await this.collectEntry(child, created.id, queue);
      }
    }
  }

  private entryToFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  private readAllEntries(
    reader: FileSystemDirectoryReader,
  ): Promise<FileSystemEntry[]> {
    return new Promise((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const readBatch = (): void => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(all);
          } else {
            all.push(...batch);
            readBatch(); // readEntries trả tối đa ~100/lần
          }
        }, reject);
      };
      readBatch();
    });
  }

  private async uploadOne(
    original: File,
    folderId: string | null,
  ): Promise<void> {
    const taskId = crypto.randomUUID();
    this.tasks.update((l) => [
      ...l,
      {
        id: taskId,
        name: original.name,
        size: original.size,
        progress: 0,
        status: 'preparing',
      },
    ]);

    let session: PendingSession | undefined;
    let fp = '';
    try {
      // Nén ảnh trước khi upload (mục 4.A).
      const file = await this.maybeCompress(original);
      const ext = original.name.includes('.')
        ? original.name.split('.').pop()!.toLowerCase()
        : '';
      fp = this.fingerprint(original, folderId);
      const pending = this.loadPending();

      let doneParts = new Map<number, string>(); // partNumber -> ETag

      if (pending[fp]) {
        // Resume: hỏi R2 các part đã có.
        session = pending[fp];
        const existing = await firstValueFrom(
          this.api.listParts(session.fileId, session.uploadId),
        ).catch(() => []);
        doneParts = new Map(existing.map((p) => [p.PartNumber, p.ETag]));
      } else {
        const init = await firstValueFrom(
          this.api.initUpload({
            name: original.name,
            extension: ext,
            mimeType: original.type || 'application/octet-stream',
            size: String(file.size),
            folderId,
          }),
        );
        session = {
          fileId: init.fileId,
          uploadId: init.uploadId,
          key: init.key,
          partSize: init.partSize,
        };
        pending[fp] = session;
        this.savePending(pending);
      }

      const partSize = session.partSize;
      const partCount = Math.max(1, Math.ceil(file.size / partSize));
      this.updateTask(taskId, { status: 'uploading' });

      // Danh sách part còn thiếu.
      const missing: number[] = [];
      for (let i = 1; i <= partCount; i++) {
        if (!doneParts.has(i)) missing.push(i);
      }

      let completedCount = doneParts.size;
      const updateProgress = (): void =>
        this.updateTask(taskId, {
          progress: Math.round((completedCount / partCount) * 100),
        });
      updateProgress();

      // Upload song song với pool concurrency (mục 5.A).
      // Bytes đi QUA backend (proxy) rồi backend đẩy lên R2 — không dính CORS R2.
      const activeSession = session;
      await this.runPool(missing, this.concurrency, async (partNumber) => {
        const start = (partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));
        const { etag } = await firstValueFrom(
          this.api.uploadPart(
            activeSession.fileId,
            activeSession.uploadId,
            partNumber,
            blob,
          ),
        );
        doneParts.set(partNumber, etag);
        completedCount++;
        updateProgress();
      });

      // Ghép chunk.
      const parts = [...doneParts.entries()]
        .map(([PartNumber, ETag]) => ({ PartNumber, ETag }))
        .sort((a, b) => a.PartNumber - b.PartNumber);
      await firstValueFrom(
        this.api.completeUpload(session.fileId, session.uploadId, parts),
      );

      // Dọn state resume.
      delete pending[fp];
      this.savePending(pending);

      this.updateTask(taskId, { status: 'done', progress: 100 });
      this.completed.update((n) => n + 1);
    } catch (err) {
      // Upload lỗi -> abort phiên: xoá row File 'uploading' dở dang trên server
      // để KHÔNG hiện file rác lên UI (mục 5.A).
      if (session) {
        try {
          await firstValueFrom(
            this.api.abortUpload(session.fileId, session.uploadId),
          );
        } catch {
          /* bỏ qua lỗi abort */
        }
        const pending = this.loadPending();
        delete pending[fp];
        this.savePending(pending);
      }
      this.updateTask(taskId, {
        status: 'error',
        error: (err as Error).message,
      });
    }
  }

  private async maybeCompress(file: File): Promise<File> {
    const isImage = file.type.startsWith('image/');
    // Bỏ qua GIF/SVG (nén hỏng động/vector).
    if (!isImage || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return file;
    }
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 2560,
        useWebWorker: true,
      });
      // Chỉ dùng bản nén nếu thực sự nhỏ hơn.
      return compressed.size < file.size
        ? new File([compressed], file.name, { type: compressed.type })
        : file;
    } catch {
      return file; // nén lỗi thì dùng bản gốc
    }
  }

  /** Chạy tối đa `limit` tác vụ song song. */
  private async runPool<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    const runners = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (index < items.length) {
          const current = items[index++];
          await worker(current);
        }
      },
    );
    await Promise.all(runners);
  }
}
