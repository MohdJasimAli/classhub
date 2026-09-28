import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema, paginationSchema } from './common.validator.js';

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately lenient at the login boundary: strength is enforced at
  // registration/creation time, not at sign-in time.
  password: z.string().min(1, 'Password is required').max(128),
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/** Admin-driven student creation. The role is never client-selectable. */
export const createStudentSchema = registerSchema.extend({
  studentCode: z.string().trim().min(2).max(30).optional(),
});

export const updateStudentSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    studentCode: z.string().trim().min(2).max(30).nullable().optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Your current password is required'),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
});

export const meQuerySchema = paginationSchema.partial();

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
