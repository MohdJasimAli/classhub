import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { notFound } from '../utils/errors.js';import { buildPageMeta, sendSuccess } from '../utils/response.js';
import { currentUser } from '../middleware/auth.js';
import { notificationService } from '../services/notification.service.js';

/** GET /api/notifications */
export async function listNotifications(req: Request, res: Response) {
  const user = currentUser(req);
  const { page, limit, unreadOnly } = req.query as unknown as {
    page: number;
    limit: number;
    unreadOnly?: string;
  };

  const { items, total, unreadCount } = await notificationService.listForUser(user.id, {
    page,
    limit,
    unreadOnly: unreadOnly === 'true',
  });

  return sendSuccess(
    res,
    { items, unreadCount },
    200,
    undefined,
    buildPageMeta(page, limit, total),
  );
}

/** GET /api/notifications/unread-count */
export async function unreadCount(req: Request, res: Response) {
  const user = currentUser(req);
  const count = await notificationService.unreadCount(user.id);
  return sendSuccess(res, { count });
}

/** PATCH /api/notifications/:id/read */
export async function markAsRead(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = req.params as { id: string };

  // Scope the lookup to the caller. A notification belonging to somebody else
  // is reported as 404 (not 403) so the endpoint cannot be used to discover
  // that someone else's notification id exists.
  const existing = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { id: true, readAt: true },
  });
  if (!existing) throw notFound('Notification not found');

  // Idempotent: marking an already-read notification still succeeds.
  if (!existing.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  const count = await notificationService.unreadCount(user.id);
  return sendSuccess(res, { id, read: true, unreadCount: count }, 200, 'Marked as read');
}

/** PATCH /api/notifications/:id/unread */
export async function markAsUnread(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = req.params as { id: string };

  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: null },
  });
  if (result.count === 0) throw notFound('Notification not found');

  const count = await notificationService.unreadCount(user.id);
  return sendSuccess(res, { id, read: false, unreadCount: count }, 200, 'Marked as unread');
}

/** PATCH /api/notifications/read-all */
export async function markAllAsRead(req: Request, res: Response) {
  const user = currentUser(req);
  const updated = await notificationService.markAllRead(user.id);
  return sendSuccess(res, { updated, unreadCount: 0 }, 200, 'All notifications marked as read');
}

/** DELETE /api/notifications/:id */
export async function deleteNotification(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = req.params as { id: string };

  const removed = await notificationService.remove(id, user.id);
  if (removed === 0) throw notFound('Notification not found');

  return sendSuccess(res, { id }, 200, 'Notification deleted');
}

/**
 * POST /api/notifications/test-email
 *
 * Sends a diagnostic message to the signed-in admin so they can confirm
 * outbound delivery without waiting 24 hours for a reminder. The response
 * reports the resolved transport, which is what makes a misconfiguration
 * obvious ("CAPTURE - not sent" vs "SENT over SMTP").
 */
export async function sendTestEmail(req: Request, res: Response) {
  const user = currentUser(req);
  const { emailService, describeTransport } = await import('../services/email/service.js');

  const result = await emailService.sendTestEmail({
    to: user.email,
    userId: user.id,
    recipientName: user.name,
  });

  const transport = describeTransport();

  if (!result.ok) {
    // 502: we reached our side fine, the upstream mail server did not.
    return sendSuccess(
      res,
      { sent: false, error: result.error, transport },
      502,
      'Delivery failed - see the error in the response and the EmailLog table',
    );
  }

  return sendSuccess(
    res,
    { sent: true, transport },
    200,
    transport.delivered
      ? `Test email sent to ${user.email}`
      : `Test email captured (not sent) - SMTP is not configured. Set EMAIL_HOST and EMAIL_USER in server/.env.`,
  );
}
