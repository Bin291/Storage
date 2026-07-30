import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';

/**
 * Thông báo trong app (mục 12.J). Bảng thật (không chỉ Realtime) vì chia sẻ
 * hay xảy ra lúc người nhận đang offline — Realtime-only sẽ nuốt mất thông báo
 * (điểm yếu đã ghi ở mục 11.F).
 *
 * Việc TẠO thông báo nằm ở `ShareService.invite()` — trong cùng transaction
 * với `Share`, nên service này chỉ lo đọc/đánh dấu đã đọc.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<Notification> {
    const found = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('Không tìm thấy thông báo');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: found.readAt ?? new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: res.count };
  }
}
