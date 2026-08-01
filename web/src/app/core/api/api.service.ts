import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { FileSource } from './file-source';
import {
  BreadcrumbNode,
  FileItem,
  FileListResult,
  FileStat,
  FolderItem,
  ListParams,
  NotificationItem,
  PublicShareMeta,
  SearchResultItem,
  SharedBrowseResult,
  SharedWithMeItem,
  ShareView,
  TrashItem,
} from './models';

/** Client REST tới API NestJS (token gắn tự động bởi authInterceptor). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // --- Folders ---
  createFolder(name: string, parentId: string | null): Observable<FolderItem> {
    return this.http.post<FolderItem>(`${this.base}/folders`, {
      name,
      parentId,
    });
  }

  folderChildren(parentId: string | null): Observable<FolderItem[]> {
    let params = new HttpParams();
    if (parentId) params = params.set('parentId', parentId);
    return this.http.get<FolderItem[]>(`${this.base}/folders/children`, {
      params,
    });
  }

  breadcrumb(folderId: string): Observable<BreadcrumbNode[]> {
    return this.http.get<BreadcrumbNode[]>(
      `${this.base}/folders/${folderId}/breadcrumb`,
    );
  }

  renameFolder(id: string, name: string): Observable<FolderItem> {
    return this.http.patch<FolderItem>(`${this.base}/folders/${id}/rename`, {
      name,
    });
  }

  /** Sao chép cả cây thư mục sang chỗ khác — bản sao THẬT (mục 11.N). */
  copyFolder(id: string, parentId: string | null): Observable<FolderItem> {
    return this.http.post<FolderItem>(`${this.base}/folders/${id}/copy`, {
      parentId,
    });
  }

  moveFolder(id: string, parentId: string | null): Observable<FolderItem> {
    return this.http.patch<FolderItem>(`${this.base}/folders/${id}/move`, {
      parentId,
    });
  }

  starFolder(id: string, isStarred: boolean): Observable<FolderItem> {
    return this.http.patch<FolderItem>(`${this.base}/folders/${id}/star`, {
      isStarred,
    });
  }

  /** Xoá mềm — vào Thùng rác, khôi phục được (mục 7.E/11.K). */
  trashFolder(id: string): Observable<{ status: string }> {
    return this.http.patch<{ status: string }>(
      `${this.base}/folders/${id}/trash`,
      {},
    );
  }

  restoreFolder(id: string): Observable<FolderItem> {
    return this.http.patch<FolderItem>(`${this.base}/folders/${id}/restore`, {});
  }

  /** Xoá vĩnh viễn — chỉ hợp lệ khi folder đã ở Thùng rác (mục 7.E/11.K). */
  hardDeleteFolder(id: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.base}/folders/${id}`);
  }

  // --- Files ---
  listFiles(params: ListParams): Observable<FileListResult> {
    let p = new HttpParams();
    // Tìm theo tên thắng mọi lăng kính khác: đang tìm thì phải quét cả kho.
    if (params.q && params.q.trim()) {
      p = p.set('q', params.q.trim());
    } else if (params.extensions && params.extensions.length) {
      p = p.set('extensions', params.extensions.join(','));
    } else if (params.recent) {
      p = p.set('recent', 'true');
    } else if (params.starred) {
      p = p.set('starred', 'true');
    } else if (params.folderId) {
      p = p.set('folderId', params.folderId);
    }
    if (params.category) p = p.set('category', params.category);
    if (params.sort) p = p.set('sort', params.sort);
    if (params.order) p = p.set('order', params.order);
    if (params.page) p = p.set('page', String(params.page));
    if (params.pageSize) p = p.set('pageSize', String(params.pageSize));
    return this.http.get<FileListResult>(`${this.base}/files`, { params: p });
  }

  /** Số đếm theo đuôi file cho sidebar "Theo loại" + Dashboard (mục 11.H). */
  stats(): Observable<FileStat[]> {
    return this.http.get<FileStat[]>(`${this.base}/files/stats`);
  }

  getFile(id: string): Observable<FileItem> {
    return this.http.get<FileItem>(`${this.base}/files/${id}`);
  }

  usage(): Observable<{ totalBytes: string; count: number }> {
    return this.http.get<{ totalBytes: string; count: number }>(
      `${this.base}/files/stats/usage`,
    );
  }

  renameFile(id: string, name: string): Observable<FileItem> {
    return this.http.patch<FileItem>(`${this.base}/files/${id}/rename`, {
      name,
    });
  }

  /** Sao chép tệp sang thư mục khác — tốn thêm dung lượng (mục 11.N). */
  copyFile(id: string, folderId: string | null): Observable<FileItem> {
    return this.http.post<FileItem>(`${this.base}/files/${id}/copy`, {
      folderId,
    });
  }

  moveFile(id: string, folderId: string | null): Observable<FileItem> {
    return this.http.patch<FileItem>(`${this.base}/files/${id}/move`, {
      folderId,
    });
  }

  starFile(id: string, isStarred: boolean): Observable<FileItem> {
    return this.http.patch<FileItem>(`${this.base}/files/${id}/star`, {
      isStarred,
    });
  }

  /** Xoá mềm — vào Thùng rác, khôi phục được (mục 7.E/11.K). */
  trashFile(id: string): Observable<FileItem> {
    return this.http.patch<FileItem>(`${this.base}/files/${id}/trash`, {});
  }

  restoreFile(id: string): Observable<FileItem> {
    return this.http.patch<FileItem>(`${this.base}/files/${id}/restore`, {});
  }

  /** Xoá vĩnh viễn — chỉ hợp lệ khi file đã ở Thùng rác (mục 7.E/11.K). */
  hardDeleteFile(id: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.base}/files/${id}`);
  }

  // --- Thùng rác (mục 11.K) ---
  listTrash(): Observable<TrashItem[]> {
    return this.http.get<TrashItem[]>(`${this.base}/trash`);
  }

  emptyTrash(): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.base}/trash/empty`, {});
  }

  // --- Upload (multipart, mục 5.A) ---
  initUpload(body: {
    name: string;
    extension: string;
    mimeType: string;
    size: string;
    folderId: string | null;
  }): Observable<{
    fileId: string;
    uploadId: string;
    key: string;
    partSize: number;
    partCount: number;
  }> {
    return this.http.post<{
      fileId: string;
      uploadId: string;
      key: string;
      partSize: number;
      partCount: number;
    }>(`${this.base}/uploads/init`, body);
  }

  /** Upload 1 part QUA backend (proxy) — gửi bytes, backend đẩy lên GCS. Tránh CORS bucket. */
  uploadPart(
    fileId: string,
    uploadId: string,
    partNumber: number,
    blob: Blob,
  ): Observable<{ etag: string }> {
    const params = new HttpParams()
      .set('uploadId', uploadId)
      .set('partNumber', String(partNumber));
    return this.http.post<{ etag: string }>(
      `${this.base}/uploads/${fileId}/part`,
      blob,
      {
        params,
        headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' }),
      },
    );
  }

  listParts(
    fileId: string,
    uploadId: string,
  ): Observable<{ PartNumber: number; ETag: string }[]> {
    return this.http.post<{ PartNumber: number; ETag: string }[]>(
      `${this.base}/uploads/${fileId}/list-parts`,
      { uploadId },
    );
  }

  completeUpload(
    fileId: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ): Observable<FileItem> {
    return this.http.post<FileItem>(
      `${this.base}/uploads/${fileId}/complete`,
      { uploadId, parts },
    );
  }

  abortUpload(fileId: string, uploadId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.base}/uploads/${fileId}/abort`,
      { uploadId },
    );
  }

  // --- AI Search (mục 8.C) ---
  search(q: string): Observable<SearchResultItem[]> {
    return this.http.get<SearchResultItem[]>(`${this.base}/search`, {
      params: new HttpParams().set('q', q),
    });
  }

  // --- AI (mục 7.B) ---
  retryFile(fileId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.base}/ai/retry/${fileId}`,
      {},
    );
  }

  /** Tạo lại riêng ảnh xem trước — không đụng AI pipeline (mục 11.I). */
  retryThumbnail(fileId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.base}/ai/retry-thumbnail/${fileId}`,
      {},
    );
  }

  /** Tạo lại ảnh xem trước cho MỌI file đang thiếu cùng lúc (mục 11.I). */
  retryMissingThumbnails(): Observable<{ status: string; count: number }> {
    return this.http.post<{ status: string; count: number }>(
      `${this.base}/ai/retry-missing-thumbnails`,
      {},
    );
  }

  // --- Download (mục 5.C / 5.E / 11.J) ---
  fileDownloadUrl(fileId: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(
      `${this.base}/downloads/file/${fileId}`,
    );
  }

  /** URL tải xuống thật (attachment + đúng tên gốc) — dùng cho nút "Tải xuống". */
  fileDownloadAttachmentUrl(fileId: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(
      `${this.base}/downloads/file/${fileId}/download`,
    );
  }

  /** Bytes gốc QUA backend — cho renderer DOCX/XLSX cần fetch() (mục 11.I). */
  fileBlob(fileId: string): Observable<Blob> {
    return this.http.get(`${this.base}/downloads/file/${fileId}/blob`, {
      responseType: 'blob',
    });
  }

  /** Văn bản AI đã trích xuất sẵn — preview dự phòng (mục 11.I). */
  fileText(fileId: string): Observable<{ text: string }> {
    return this.http.get<{ text: string }>(
      `${this.base}/downloads/file/${fileId}/text`,
    );
  }

  startFolderZip(folderId: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(
      `${this.base}/downloads/folder/${folderId}/zip`,
      {},
    );
  }

  /** Tải xuống hàng loạt (mục 11.J) — chọn hỗn hợp file rời rạc + folder, nén thành 1 zip. */
  startBulkZip(fileIds: string[], folderIds: string[]): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(`${this.base}/downloads/bulk-zip`, {
      fileIds,
      folderIds,
    });
  }

  zipStatus(
    jobId: string,
  ): Observable<{ status: 'preparing' | 'ready' | 'error'; url?: string; error?: string }> {
    return this.http.get<{
      status: 'preparing' | 'ready' | 'error';
      url?: string;
      error?: string;
    }>(`${this.base}/downloads/zip/${jobId}`);
  }

  // --- Chia sẻ: quản lý quyền, kênh A + B (mục 12.E nhóm A) ---
  createShareLink(body: {
    fileId?: string;
    folderId?: string;
    allowDownload?: boolean;
    expiresInDays?: number;
    password?: string;
  }): Observable<ShareView> {
    return this.http.post<ShareView>(`${this.base}/shares/link`, body);
  }

  inviteShare(body: {
    fileId?: string;
    folderId?: string;
    email: string;
    allowDownload?: boolean;
    expiresInDays?: number;
  }): Observable<ShareView> {
    return this.http.post<ShareView>(`${this.base}/shares/invite`, body);
  }

  listShares(fileId?: string, folderId?: string): Observable<ShareView[]> {
    let p = new HttpParams();
    if (fileId) p = p.set('fileId', fileId);
    if (folderId) p = p.set('folderId', folderId);
    return this.http.get<ShareView[]>(`${this.base}/shares`, { params: p });
  }

  updateShare(
    id: string,
    body: {
      allowDownload?: boolean;
      expiresInDays?: number | null;
      password?: string;
    },
  ): Observable<ShareView> {
    return this.http.patch<ShareView>(`${this.base}/shares/${id}`, body);
  }

  revokeShare(id: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.base}/shares/${id}`);
  }

  // --- Chia sẻ: phía người nhận, kênh A (mục 12.E nhóm C) ---
  listSharedWithMe(): Observable<SharedWithMeItem[]> {
    return this.http.get<SharedWithMeItem[]>(`${this.base}/shared`);
  }

  browseSharedFolder(
    shareId: string,
    folderId?: string,
  ): Observable<SharedBrowseResult> {
    let p = new HttpParams();
    if (folderId) p = p.set('folderId', folderId);
    return this.http.get<SharedBrowseResult>(
      `${this.base}/shared/${shareId}/list`,
      { params: p },
    );
  }

  // --- Chia sẻ: link công khai, kênh B (mục 12.E nhóm B) ---
  private shareHeaders(session?: string | null): HttpHeaders | undefined {
    return session
      ? new HttpHeaders({ 'X-Share-Session': session })
      : undefined;
  }

  publicShareMeta(
    token: string,
    session?: string | null,
  ): Observable<PublicShareMeta> {
    return this.http.get<PublicShareMeta>(`${this.base}/s/${token}`, {
      headers: this.shareHeaders(session),
    });
  }

  unlockShare(token: string, password: string): Observable<{ session: string }> {
    return this.http.post<{ session: string }>(`${this.base}/s/${token}/unlock`, {
      password,
    });
  }

  publicShareList(
    token: string,
    folderId?: string,
    session?: string | null,
  ): Observable<SharedBrowseResult> {
    let p = new HttpParams();
    if (folderId) p = p.set('folderId', folderId);
    return this.http.get<SharedBrowseResult>(`${this.base}/s/${token}/list`, {
      params: p,
      headers: this.shareHeaders(session),
    });
  }

  // --- Nguồn nội dung theo ngữ cảnh quyền (mục 12.F) ---

  /** Chủ sở hữu — đường /downloads sẵn có. */
  ownedSource(fileId: string): FileSource {
    return {
      blob: () => firstValueFrom(this.fileBlob(fileId)),
      text: () => firstValueFrom(this.fileText(fileId)).then((r) => r.text),
      contentUrl: () =>
        firstValueFrom(this.fileDownloadUrl(fileId)).then((r) => r.url),
      downloadUrl: () =>
        firstValueFrom(this.fileDownloadAttachmentUrl(fileId)).then((r) => r.url),
    };
  }

  /** Người được chia sẻ trực tiếp — kênh A. */
  sharedSource(fileId: string): FileSource {
    const base = `${this.base}/shared/file/${fileId}`;
    return {
      blob: () =>
        firstValueFrom(this.http.get(`${base}/blob`, { responseType: 'blob' })),
      text: () =>
        firstValueFrom(this.http.get<{ text: string }>(`${base}/text`)).then(
          (r) => r.text,
        ),
      contentUrl: () =>
        firstValueFrom(this.http.get<{ url: string }>(`${base}/content`)).then(
          (r) => r.url,
        ),
      downloadUrl: () =>
        firstValueFrom(this.http.get<{ url: string }>(`${base}/download`)).then(
          (r) => r.url,
        ),
    };
  }

  /** Link công khai — kênh B. `fileId` chỉ cần khi link chia sẻ cả thư mục. */
  publicSource(
    token: string,
    fileId?: string,
    session?: string | null,
  ): FileSource {
    const base = `${this.base}/s/${token}`;
    const headers = this.shareHeaders(session);
    let params = new HttpParams();
    if (fileId) params = params.set('fileId', fileId);
    return {
      blob: () =>
        firstValueFrom(
          this.http.get(`${base}/blob`, {
            params,
            headers,
            responseType: 'blob',
          }),
        ),
      text: () =>
        firstValueFrom(
          this.http.get<{ text: string }>(`${base}/text`, { params, headers }),
        ).then((r) => r.text),
      contentUrl: () =>
        firstValueFrom(
          this.http.get<{ url: string }>(`${base}/content`, { params, headers }),
        ).then((r) => r.url),
      downloadUrl: () =>
        firstValueFrom(
          this.http.get<{ url: string }>(`${base}/download`, {
            params,
            headers,
          }),
        ).then((r) => r.url),
    };
  }

  // --- Thông báo (mục 12.J) ---
  listNotifications(unreadOnly = false): Observable<NotificationItem[]> {
    let p = new HttpParams();
    if (unreadOnly) p = p.set('unread', 'true');
    return this.http.get<NotificationItem[]>(`${this.base}/notifications`, {
      params: p,
    });
  }

  unreadNotificationCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(
      `${this.base}/notifications/unread-count`,
    );
  }

  markNotificationRead(id: string): Observable<NotificationItem> {
    return this.http.patch<NotificationItem>(
      `${this.base}/notifications/${id}/read`,
      {},
    );
  }

  markAllNotificationsRead(): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(
      `${this.base}/notifications/read-all`,
      {},
    );
  }

  // --- Avatar cá nhân hoá (mục 11.E) ---
  avatarUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.base}/me/avatar-url`);
  }

  uploadAvatar(blob: Blob): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/me/avatar`, blob, {
      headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' }),
    });
  }

  deleteAvatar(): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.base}/me/avatar`);
  }
}
