import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Role-aware: the controller branches on the authenticated user's role.
router.get('/', requireAuth, asyncHandler(getDashboard));

export default router;
