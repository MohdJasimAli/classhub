import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/**
 * In-app notification center. Every notification is persisted so it survives
 * restarts and can be paginated, marked read, and counted as unread.
 */
export const notificationService = {
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    resourceId?: string | null;
  }) {
    return prisma.notification.create({ data });
  },

  /** Fan-out helper: creates one notification per user in a single insert. */
  async createMany(
    users: Array<{ id: string }>,
    data: {
      type: NotificationType;
      title: string;
      message: string;
      link?: string | null;
      resourceId?: string | null;
    },
  ) {
    if (users.length === 0) return { count: 0 };
    return prisma.notification.createMany({
      data: users.map((u) => ({ ...data, userId: u.id })),
      skipDuplicates: true,
    });
  },

  async listForUser(userId: string, options: { page: number; limit: number; unreadOnly?: boolean }) {
    const { page, limit, unreadOnly } = options;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unreadCount };
  },

  async unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  /**
   * Mark a single notification as read.
   * The `userId` in the where-clause is the authorization check: a student
   * cannot mark (or even probe) another user's notification.
   */
  async markRead(id: string, userId: string) {
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  },

  async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  },

  async remove(id: string, userId: string) {
    const result = await prisma.notification.deleteMany({ where: { id, userId } });
    return result.count;
  },
};
