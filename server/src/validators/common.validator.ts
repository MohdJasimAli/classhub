import { z } from 'zod';

/** Primitives reused across validators. */

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Email is required')
  .max(255)
  .email('Enter a valid email address')
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

/**
 * A datetime string coming from a form. Rejects values that are not a real
 * calendar date (e.g. 2026-02-31) and converts to a Date.
 */
export const dateSchema = z
  .string()
  .trim()
  .min(1, 'This date is required')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid date and time')
  .transform((value) => new Date(value));

const futureDate = (label: string) =>
  dateSchema.refine((d) => d.getTime() > Date.now(), `${label} must be in the future`);

/**
 * Path-parameter guard.
 *
 * `.passthrough()` is essential: routes like `/:id/questions/:questionId` and
 * `/:assignmentId/submissions/:submissionId` share this schema, and a plain
 * z.object() would STRIP the extra params when the validated result replaces
 * `req.params`, leaving the controller with `undefined` ids.
 */
export const idParamSchema = z
  .object({
    id: z.string().trim().min(1, 'An id is required'),
  })
  .passthrough();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const marksSchema = z.coerce
  .number()
  .min(0, 'Marks cannot be negative')
  .max(1000, 'Marks look too large')
  .refine((n) => Number.isFinite(n), 'Marks must be a number');

/**
 * Boolean that also accepts the string forms used by multipart form fields.
 *
 * A `multipart/form-data` body carries every value as a string, so a plain
 * `z.boolean()` rejects `isPublished=true` from an HTML form even though the
 * intent is unambiguous. Accepting both keeps the JSON API strict and the
 * upload endpoints usable.
 */
export const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

export { futureDate };
