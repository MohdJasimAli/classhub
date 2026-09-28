import { Router } from 'express';
import {
  createResource,
  deleteResource,
  downloadFile,
  getResource,
  listResources,
  setResourcePublished,
  updateResource,
} from '../controllers/resource.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { resourceUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createResourceSchema,
  publishResourceSchema,
  resourceIdParamSchema,
  resourceListQuerySchema,
  updateResourceSchema,
} from '../validators/resource.validator.js';

const router = Router();

router.use(requireAuth);

// ------------------------------ Both roles ----------------------------------
router.get('/', validate(resourceListQuerySchema, 'query'), asyncHandler(listResources));
router.get('/:id', validate(resourceIdParamSchema, 'params'), asyncHandler(getResource));

// ------------------------------ Admin only ----------------------------------
// `requireAdmin` is applied per-route so the student routes above stay reachable.
router.post(
  '/',
  requireAdmin,
  resourceUpload,
  validate(createResourceSchema),
  asyncHandler(createResource),
);

router.put(
  '/:id',
  requireAdmin,
  resourceUpload,
  validate(resourceIdParamSchema, 'params'),
  validate(updateResourceSchema),
  asyncHandler(updateResource),
);

router.patch(
  '/:id/publish',
  requireAdmin,
  validate(resourceIdParamSchema, 'params'),
  validate(publishResourceSchema),
  asyncHandler(setResourcePublished),
);

router.delete('/:id', requireAdmin, validate(resourceIdParamSchema, 'params'), asyncHandler(deleteResource));

export default router;

/**
 * `/api/files/:filename` lives on its own router because it is shared by both
 * roles and authorises per file.
 */
export const filesRouter = Router();
filesRouter.get('/:filename', requireAuth, asyncHandler(downloadFile));
