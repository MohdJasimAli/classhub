import { Router } from 'express';
import { z } from 'zod';
import {
  deleteStudent,
  exportStudents,
  getStudent,
  listStudents,
  resetStudentPassword,
  updateStudent,
} from '../controllers/student.controller.js';
import {
  listReminders,
  runReminderSweepNow,
} from '../controllers/dashboard.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema, searchQuerySchema } from '../validators/common.validator.js';
import { updateStudentSchema } from '../validators/auth.validator.js';

const router = Router();

/**
 * Every route in this module is admin-only. `router.use(requireAdmin)` is the
 * single enforcement point, so there is no per-route gap to forget.
 */
router.use(requireAuth, requireAdmin);

const studentQuerySchema = searchQuerySchema.extend({
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});

// ------------------------------- Students ------------------------------------
router.get('/students/export', asyncHandler(exportStudents));
router.get('/students', validate(studentQuerySchema, 'query'), asyncHandler(listStudents));
router.get('/students/:id', validate(idParamSchema, 'params'), asyncHandler(getStudent));
router.put(
  '/students/:id',
  validate(idParamSchema, 'params'),
  validate(updateStudentSchema),
  asyncHandler(updateStudent),
);
router.delete('/students/:id', validate(idParamSchema, 'params'), asyncHandler(deleteStudent));
router.post(
  '/students/:id/reset-password',
  validate(idParamSchema, 'params'),
  validate(z.object({ password: z.string().min(8).max(128) })),
  asyncHandler(resetStudentPassword),
);

// ------------------------------- Reminders ----------------------------------
// The sweep is idempotent, so triggering it manually is safe and is the same
// code path the cron job runs.
router.post('/reminders/run', asyncHandler(runReminderSweepNow));

router.get(
  '/reminders',
  validate(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), 'query'),
  asyncHandler(listReminders),
);

export default router;
