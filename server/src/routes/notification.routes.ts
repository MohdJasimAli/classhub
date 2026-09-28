import { Router } from 'express';
import { z } from 'zod';
import {
  deleteNotification,
  listNotifications,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  sendTestEmail,
  unreadCount,
} from '../controllers/notification.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema, paginationSchema } from '../validators/common.validator.js';

const router = Router();

const listQuerySchema = paginationSchema.extend({
  unreadOnly: z.enum(['true', 'false']).optional(),
});

router.use(requireAuth);

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(listNotifications));
router.get('/unread-count', asyncHandler(unreadCount));

// `read-all` is declared before `/:id/read` so the literal segment wins.
router.patch('/read-all', asyncHandler(markAllAsRead));
router.patch('/:id/read', validate(idParamSchema, 'params'), asyncHandler(markAsRead));
router.patch('/:id/unread', validate(idParamSchema, 'params'), asyncHandler(markAsUnread));
router.delete('/:id', validate(idParamSchema, 'params'), asyncHandler(deleteNotification));

// Declared last so the literal segment cannot be swallowed by `/:id/...`.
router.post('/test-email', requireAuth, requireAdmin, asyncHandler(sendTestEmail));

export default router;
