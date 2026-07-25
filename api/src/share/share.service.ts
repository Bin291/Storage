import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { File, Folder, Prisma, Share } from '@prisma/client';
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Kết quả kiểm quyền đọc — `share = null` nghĩa là chính chủ (mục 12.I). */
export interface GrantedAccess {
  file: File;
  share: Share | null;
}

/** Share đã phân giải từ token, kèm target đã kiểm hợp lệ (mục 12.E). */
export interface ResolvedShare {
  share: Share;
  file: File | null;
  folder: Folder | null;
}

export interface ShareView {
  id: string;
  kind: 'link' | 'invite';
  url: string | null;
  email: string | null;
  allowDownload: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
}

export interface SharedWithMeItem {
  shareId: string;
  kind: 'file' | 'folder';
  id: string;
  name: string;
  extension: string | null;
  mimeType: string | null;
  size: string | null;
  thumbnailUrl: string | null;
  ownerEmail: string | null;
  allowDownload: boolean;
  expiresAt: string | null;
  sharedAt: string;
}

/** Điều kiện "share còn hiệu lực" dùng lại ở mọi truy vấn (mục 12.D). */
function notExpired(): Prisma.ShareWhereInput {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/**
 * Chia sẻ (mục 12) — 2 kênh dùng chung 1 bảng `Share`:
 *   kênh A (trực tiếp): `sharedWithUserId`, xác thực bằng JWT của người nhận
 *   kênh B (link):      `token`, xác thực bằng token (+ mật khẩu tuỳ chọn)
 *
 * NGUYÊN TẮC: mọi đường đọc đều đi qua `assertGrantedAccess` (kênh A) hoặc
 * `resolveShare` (kênh B) — không handler nào tự kiểm điều kiện rời rạc.
 */
@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);
  /** Dự phòng khi thiếu SHARE_SESSION_SECRET: đổi mỗi lần boot (buộc mở khoá lại). */
  private readonly fallbackSecret = randomBytes(32).toString('hex');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private sessionSecret(): string {
    const configured = this.config.get<string>('share.sessionSecret');
    if (configured) return configured;
    return this.fallbackSecret;
  }

  contentTtl(): number {
    return this.config.get<number>('share.contentTtlSeconds') ?? 600;
  }

  private buildUrl(token: string): string {
    const base = (
      this.config.get<string>('share.baseUrl') ?? 'http://localhost:4200'
    ).replace(/\/$/, '');
    return `${base}/s/${token}`;
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }

  /**
   * Token phiên sau khi mở khoá mật khẩu (mục 12.E) — HMAC tự ký, KHÔNG thêm
   * dependency JWT: payload chỉ gồm `shareToken.exp`, không chứa gì nhạy cảm.
   */
  private signSessionToken(shareToken: string, ttlSeconds = 1800): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${shareToken}.${exp}`;
    const sig = createHmac('sha256', this.sessionSecret())
      .update(payload)
      .digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${sig}`;
  }

  private verifySessionToken(
    sessionToken: string,
    shareToken: string,
  ): boolean {
    const dot = sessionToken.lastIndexOf('.');
    if (dot <= 0) return false;
    const b64 = sessionToken.slice(0, dot);
    const sig = sessionToken.slice(dot + 1);
    let payload: string;
    try {
      payload = Buffer.from(b64, 'base64url').toString('utf8');
    } catch {
      return false;
    }
    const expected = createHmac('sha256', this.sessionSecret())
      .update(payload)
      .digest('base64url');
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

    const sep = payload.lastIndexOf('.');
    if (sep <= 0) return false;
    if (payload.slice(0, sep) !== shareToken) return false;
    return Number(payload.slice(sep + 1)) > Math.floor(Date.now() / 1000);
  }

  /**
   * Tra user theo email (mục 12.I) — đọc thẳng `auth.users` vì Prisma kết nối
   * ở cấp service-role. Không có bảng `User` riêng (quyết định mục 11.E).
   */
  private async findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string } | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; email: string }[]>`
      select id::text as id, email
      from auth.users
      where lower(email) = lower(${email})
      limit 1
    `;
    return rows[0] ?? null;
  }

  /** Email theo id — để hiển thị "ai đã chia sẻ" ở view Được chia sẻ với tôi. */
  private async emailsByIds(ids: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return {};
    const rows = await this.prisma.$queryRaw<{ id: string; email: string }[]>`
      select id::text as id, email
      from auth.users
      where id::text in (${Prisma.join(unique)})
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.id] = r.email;
    return map;
  }

  /** Id folder từ chính nó lên tới gốc (dùng để verify hậu duệ — mục 12.D). */
  private async ancestorFolderIds(
    ownerId: string,
    folderId: string | null,
  ): Promise<string[]> {
    const ids: string[] = [];
    const guard = new Set<string>();
    let cur = folderId;
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      ids.push(cur);
      const f: { parentId: string | null } | null =
        await this.prisma.folder.findFirst({
          where: { id: cur, userId: ownerId, deletedAt: null },
          select: { parentId: true },
        });
      if (!f) break;
      cur = f.parentId;
    }
    return ids;
  }

  /** Target phải thuộc về user đang thao tác và đang active. */
  private async assertOwnedTarget(
    userId: string,
    fileId?: string,
    folderId?: string,
  ): Promise<void> {
    if (!fileId === !folderId) {
      throw new BadRequestException(
        'Phải chọn đúng một mục để chia sẻ (tệp hoặc thư mục)',
      );
    }
    if (fileId) {
      const file = await this.prisma.file.findFirst({
        where: { id: fileId, userId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('Không tìm thấy tệp');
    } else {
      const folder = await this.prisma.folder.findFirst({
        where: { id: folderId, userId, deletedAt: null },
      });
      if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
    }
  }

  private expiryFrom(days?: number | null): Date | null {
    if (days === null || days === undefined) return null;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private toView(share: Share): ShareView {
    return {
      id: share.id,
      kind: share.token ? 'link' : 'invite',
      url: share.token ? this.buildUrl(share.token) : null,
      email: share.sharedWithEmail,
      allowDownload: share.allowDownload,
      hasPassword: !!share.passwordHash,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      viewCount: share.viewCount,
      downloadCount: share.downloadCount,
      createdAt: share.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------- nhóm A: quản lý quyền

  /** Tạo link công khai — kênh B (mục 12.E). */
  async createLink(
    userId: string,
    dto: {
      fileId?: string;
      folderId?: string;
      allowDownload?: boolean;
      expiresInDays?: number;
      password?: string;
    },
  ): Promise<ShareView> {
    await this.assertOwnedTarget(userId, dto.fileId, dto.folderId);
    const share = await this.prisma.share.create({
      data: {
        userId,
        fileId: dto.fileId ?? null,
        folderId: dto.folderId ?? null,
        token: randomBytes(16).toString('base64url'),
        passwordHash: dto.password ? this.hashPassword(dto.password) : null,
        allowDownload: dto.allowDownload ?? true,
        expiresAt: this.expiryFrom(dto.expiresInDays),
      },
    });
    return this.toView(share);
  }

  /**
   * Mời theo email — kênh A (mục 12.I). Tạo `Share` + `Notification` trong
   * CÙNG một transaction: tránh cảnh có quyền mà không có thông báo (hoặc
   * ngược lại).
   */
  async invite(
    userId: string,
    userEmail: string | undefined,
    dto: {
      fileId?: string;
      folderId?: string;
      email: string;
      allowDownload?: boolean;
      expiresInDays?: number;
    },
  ): Promise<ShareView> {
    await this.assertOwnedTarget(userId, dto.fileId, dto.folderId);

    const target = await this.findUserByEmail(dto.email.trim());
    if (!target) {
      throw new BadRequestException(
        'Email này chưa có tài khoản trên app. Hãy dùng Link công khai để gửi ra ngoài.',
      );
    }
    if (target.id === userId) {
      throw new BadRequestException('Không thể tự chia sẻ cho chính mình');
    }

    // Mời lại người đã có quyền = cập nhật row cũ, KHÔNG bắn thông báo trùng.
    const existing = await this.prisma.share.findFirst({
      where: {
        userId,
        fileId: dto.fileId ?? null,
        folderId: dto.folderId ?? null,
        sharedWithUserId: target.id,
      },
    });
    if (existing) {
      const updated = await this.prisma.share.update({
        where: { id: existing.id },
        data: {
          allowDownload: dto.allowDownload ?? existing.allowDownload,
          expiresAt: this.expiryFrom(dto.expiresInDays),
          sharedWithEmail: target.email,
        },
      });
      return this.toView(updated);
    }

    const name = await this.targetName(dto.fileId, dto.folderId);
    const share = await this.prisma.$transaction(async (tx) => {
      const created = await tx.share.create({
        data: {
          userId,
          fileId: dto.fileId ?? null,
          folderId: dto.folderId ?? null,
          sharedWithUserId: target.id,
          sharedWithEmail: target.email,
          allowDownload: dto.allowDownload ?? true,
          expiresAt: this.expiryFrom(dto.expiresInDays),
        },
      });
      await tx.notification.create({
        data: {
          userId: target.id,
          type: 'share_received',
          title: `${userEmail ?? 'Ai đó'} đã chia sẻ với bạn`,
          body: name,
          linkPath: '/shared',
          shareId: created.id,
        },
      });
      return created;
    });
    return this.toView(share);
  }

  private async targetName(
    fileId?: string,
    folderId?: string,
  ): Promise<string> {
    if (fileId) {
      const f = await this.prisma.file.findUnique({
        where: { id: fileId },
        select: { name: true },
      });
      return f?.name ?? 'Một tệp';
    }
    const d = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { name: true },
    });
    return d?.name ?? 'Một thư mục';
  }

  /** Mọi quyền đang cấp cho 1 target (cả link lẫn người được mời). */
  async listForTarget(
    userId: string,
    fileId?: string,
    folderId?: string,
  ): Promise<ShareView[]> {
    await this.assertOwnedTarget(userId, fileId, folderId);
    const rows = await this.prisma.share.findMany({
      where: {
        userId,
        fileId: fileId ?? null,
        folderId: folderId ?? null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => this.toView(s));
  }

  async update(
    userId: string,
    shareId: string,
    dto: {
      allowDownload?: boolean;
      expiresInDays?: number | null;
      password?: string;
    },
  ): Promise<ShareView> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId, userId },
    });
    if (!share) throw new NotFoundException('Không tìm thấy chia sẻ');

    const data: Prisma.ShareUpdateInput = {};
    if (dto.allowDownload !== undefined) data.allowDownload = dto.allowDownload;
    if (dto.expiresInDays !== undefined) {
      data.expiresAt = this.expiryFrom(dto.expiresInDays);
    }
    if (dto.password !== undefined) {
      // Chuỗi rỗng = gỡ mật khẩu.
      data.passwordHash = dto.password ? this.hashPassword(dto.password) : null;
    }
    const updated = await this.prisma.share.update({
      where: { id: shareId },
      data,
    });
    return this.toView(updated);
  }

  async revoke(userId: string, shareId: string): Promise<{ status: string }> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId, userId },
    });
    if (!share) throw new NotFoundException('Không tìm thấy chia sẻ');
    await this.prisma.share.delete({ where: { id: shareId } });
    return { status: 'revoked' };
  }

  // ------------------------------------------- nhóm C: người nhận (kênh A)

  /** View "Được chia sẻ với tôi" (mục 12.E). */
  async listSharedWithMe(userId: string): Promise<SharedWithMeItem[]> {
    const rows = await this.prisma.share.findMany({
      where: {
        sharedWithUserId: userId,
        ...notExpired(),
      },
      include: {
        file: true,
        folder: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const visible = rows.filter((s) =>
      s.file
        ? s.file.deletedAt === null && s.file.status === 'ready'
        : s.folder
          ? s.folder.deletedAt === null
          : false,
    );
    const emails = await this.emailsByIds(visible.map((s) => s.userId));

    return visible.map((s) => ({
      shareId: s.id,
      kind: s.file ? 'file' : 'folder',
      id: s.file?.id ?? s.folder!.id,
      name: s.file?.name ?? s.folder!.name,
      extension: s.file?.extension ?? null,
      mimeType: s.file?.mimeType ?? null,
      size: s.file ? s.file.size.toString() : null,
      thumbnailUrl: s.file?.thumbnailUrl ?? null,
      ownerEmail: emails[s.userId] ?? null,
      allowDownload: s.allowDownload,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      sharedAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Kiểm quyền ĐỌC 1 file cho user đang đăng nhập (mục 12.I).
   * Đúng nếu: (1) chính chủ, (2) được chia sẻ thẳng file, hoặc (3) được chia
   * sẻ một folder TỔ TIÊN của file. Sai thì 404 (không dùng 403 để không lộ
   * sự tồn tại của file).
   */
  async assertGrantedAccess(
    userId: string,
    fileId: string,
  ): Promise<GrantedAccess> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: null, status: 'ready' },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    if (file.userId === userId) return { file, share: null };

    const direct = await this.prisma.share.findFirst({
      where: { fileId, sharedWithUserId: userId, ...notExpired() },
    });
    if (direct) return { file, share: direct };

    const ancestors = await this.ancestorFolderIds(file.userId, file.folderId);
    if (ancestors.length) {
      const viaFolder = await this.prisma.share.findFirst({
        where: {
          folderId: { in: ancestors },
          sharedWithUserId: userId,
          ...notExpired(),
        },
      });
      if (viaFolder) return { file, share: viaFolder };
    }
    throw new NotFoundException('Không tìm thấy tệp');
  }

  /** Duyệt cây con của 1 folder được chia sẻ trực tiếp (kênh A). */
  async browseSharedFolder(
    userId: string,
    shareId: string,
    folderId?: string,
  ): Promise<{
    folder: { id: string; name: string };
    folders: { id: string; name: string }[];
    files: File[];
  }> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId, sharedWithUserId: userId, ...notExpired() },
    });
    if (!share?.folderId) throw new NotFoundException('Không tìm thấy chia sẻ');
    return this.listFolderWithin(share.userId, share.folderId, folderId);
  }

  // ---------------------------------------------- kênh B: link công khai

  /**
   * Phân giải token — CHỖ DUY NHẤT kiểm mọi điều kiện của kênh B (mục 12.E):
   * tồn tại → chưa hết hạn → mật khẩu đã mở → target chưa bị trash → ready.
   */
  async resolveShare(
    token: string,
    sessionToken?: string,
  ): Promise<ResolvedShare> {
    const share = await this.prisma.share.findUnique({ where: { token } });
    if (!share) {
      throw new NotFoundException('Link không tồn tại hoặc đã bị thu hồi');
    }
    if (share.expiresAt && share.expiresAt <= new Date()) {
      throw new NotFoundException('Link đã hết hạn');
    }
    if (share.passwordHash) {
      if (!sessionToken || !this.verifySessionToken(sessionToken, token)) {
        throw new UnauthorizedException('PASSWORD_REQUIRED');
      }
    }

    if (share.fileId) {
      const file = await this.prisma.file.findFirst({
        where: { id: share.fileId, deletedAt: null, status: 'ready' },
      });
      if (!file) throw new NotFoundException('Tệp không còn khả dụng');
      return { share, file, folder: null };
    }
    const folder = await this.prisma.folder.findFirst({
      where: { id: share.folderId!, deletedAt: null },
    });
    if (!folder) throw new NotFoundException('Thư mục không còn khả dụng');
    return { share, file: null, folder };
  }

  /** Đổi mật khẩu lấy token phiên (mục 12.E). */
  async unlock(token: string, password: string): Promise<{ session: string }> {
    const share = await this.prisma.share.findUnique({ where: { token } });
    if (!share) throw new NotFoundException('Link không tồn tại');
    if (share.expiresAt && share.expiresAt <= new Date()) {
      throw new NotFoundException('Link đã hết hạn');
    }
    if (!share.passwordHash) return { session: this.signSessionToken(token) };
    if (!this.verifyPassword(password, share.passwordHash)) {
      throw new UnauthorizedException('Mật khẩu không đúng');
    }
    return { session: this.signSessionToken(token) };
  }

  /** File con của 1 link folder — verify hậu duệ trước (mục 12.D). */
  async publicFileWithin(
    resolved: ResolvedShare,
    fileId: string,
  ): Promise<File> {
    if (resolved.file) {
      if (resolved.file.id !== fileId) {
        throw new NotFoundException('Không tìm thấy tệp');
      }
      return resolved.file;
    }
    const ownerId = resolved.share.userId;
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId: ownerId, deletedAt: null, status: 'ready' },
    });
    if (!file) throw new NotFoundException('Không tìm thấy tệp');
    const ancestors = await this.ancestorFolderIds(ownerId, file.folderId);
    if (!ancestors.includes(resolved.folder!.id)) {
      throw new NotFoundException('Không tìm thấy tệp');
    }
    return file;
  }

  /** Duyệt cây con của 1 link folder — verify hậu duệ trước (mục 12.D). */
  async publicBrowse(
    resolved: ResolvedShare,
    folderId?: string,
  ): Promise<{
    folder: { id: string; name: string };
    folders: { id: string; name: string }[];
    files: File[];
  }> {
    if (!resolved.folder) {
      throw new BadRequestException(
        'Link này chia sẻ một tệp, không phải thư mục',
      );
    }
    return this.listFolderWithin(
      resolved.share.userId,
      resolved.folder.id,
      folderId,
    );
  }

  /**
   * Liệt kê con trực tiếp của `folderId` với điều kiện nó nằm trong cây con
   * của `rootId`. Dùng chung cho kênh A và kênh B — đây chính là chỗ chặn lỗ
   * hổng "1 link folder đọc được mọi file của user" (mục 12.D).
   */
  private async listFolderWithin(
    ownerId: string,
    rootId: string,
    folderId?: string,
  ): Promise<{
    folder: { id: string; name: string };
    folders: { id: string; name: string }[];
    files: File[];
  }> {
    const targetId = folderId ?? rootId;
    if (targetId !== rootId) {
      const ancestors = await this.ancestorFolderIds(ownerId, targetId);
      if (!ancestors.includes(rootId)) {
        throw new NotFoundException('Không tìm thấy thư mục');
      }
    }
    const folder = await this.prisma.folder.findFirst({
      where: { id: targetId, userId: ownerId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục');

    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { userId: ownerId, parentId: targetId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.file.findMany({
        where: {
          userId: ownerId,
          folderId: targetId,
          deletedAt: null,
          status: 'ready',
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { folder, folders, files };
  }

  // --------------------------------------------------------------- counters

  /** Đếm lượt xem/tải — lỗi ở đây không được chặn việc phục vụ nội dung. */
  async bumpCounter(shareId: string, kind: 'view' | 'download'): Promise<void> {
    try {
      await this.prisma.share.update({
        where: { id: shareId },
        data: {
          lastAccessAt: new Date(),
          ...(kind === 'view'
            ? { viewCount: { increment: 1 } }
            : { downloadCount: { increment: 1 } }),
        },
      });
    } catch (err) {
      this.logger.warn(`Không cập nhật được bộ đếm: ${(err as Error).message}`);
    }
  }

  /** Chặn tải xuống khi chia sẻ ở chế độ chỉ-xem (mục 12.E). */
  assertDownloadAllowed(share: Share | null): void {
    if (share && !share.allowDownload) {
      throw new ForbiddenException('Chia sẻ này không cho phép tải xuống');
    }
  }
}
