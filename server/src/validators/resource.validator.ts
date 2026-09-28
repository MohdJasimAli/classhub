import { z } from 'zod';
import {
  booleanish,
  dateSchema,
  futureDate,
  paginationSchema,
  searchQuerySchema,
} from './common.validator.js';

const text = z.string().trim();
const optionalText = (max: number) =>
  text.max(max).optional().transform((v) => v || null);

/**
 * A resource must carry a question AND an answer in at least one form (typed
 * text or an attached file). The file half is checked in the controller because
 * multipart bodies cannot express it in the schema.
 */
export const resourceBodySchema = z.object({
  type: z.enum(['QUIZ', 'ASSIGNMENT']),
  title: z.string().trim().min(3, 'Title is required').max(160),
  description: optionalText(5000),

  questionText: optionalText(20_000),
  answerText: optionalText(20_000),

  // The admin-supplied last date. Drives the reminder.
  lastDate: futureDate('The last date'),
  isPublished: booleanish.default(false),
});

export const createResourceSchema = resourceBodySchema;

export const updateResourceSchema = z
  .object({
    type: z.enum(['QUIZ', 'ASSIGNMENT']).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    description: optionalText(5000),
    questionText: optionalText(20_000),
    answerText: optionalText(20_000),
    lastDate: futureDate('The last date').optional(),
    isPublished: booleanish.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

/** Publishing requires the student to actually have something to read. */
export const publishResourceSchema = z.object({
  isPublished: booleanish,
});

export const resourceListQuerySchema = searchQuerySchema.extend({
  type: z.enum(['all', 'QUIZ', 'ASSIGNMENT']).default('all'),
  status: z.enum(['all', 'published', 'draft', 'upcoming', 'past']).default('all'),
});

export const resourceIdParamSchema = z
  .object({ id: z.string().trim().min(1, 'An id is required') })
  .passthrough();

export { paginationSchema, dateSchema };
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
