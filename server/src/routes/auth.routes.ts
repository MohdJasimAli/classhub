import { Router } from 'express';
import {
  changePassword,
  createStudent,
  login,
  logout,
  me,
  register,
  updateProfile,
} from '../controllers/auth.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  changePasswordSchema,
  createStudentSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validator.js';

const router = Router();

// --- Public -----------------------------------------------------------------
// Rate limited with `skipSuccessfulRequests`, so only failed logins consume the
// budget. This is the brute-force brake.
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login));
router.post('/register', authLimiter, validate(registerSchema), asyncHandler(register));

// --- Any authenticated user -------------------------------------------------
router.get('/me', requireAuth, asyncHandler(me));
router.post('/logout', requireAuth, asyncHandler(logout));
router.put('/password', requireAuth, validate(changePasswordSchema), asyncHandler(changePassword));
router.put('/profile', requireAuth, validate(updateProfileSchema), asyncHandler(updateProfile));

// --- Admin only -------------------------------------------------------------
// `requireAdmin` guarantees a student can never reach this, even if they craft
// the request themselves.
router.post('/students', requireAuth, requireAdmin, validate(createStudentSchema), asyncHandler(createStudent));

export default router;
