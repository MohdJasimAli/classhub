import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { buildPageMeta, sendSuccess } from '../utils/response.js';
import { publicUser } from './auth.controller.js';
import type { UpdateStudentInput } from '../validators/auth.validator.js';

const BCRYPT_ROUNDS = 12;

const authSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  studentCode: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/**
 * GET /api/admin/students
 * Search + filter + paginate. `search` matches name, email or student code.
 */
export async function listStudents(req: Request, res: Response) {
  const { page, limit, search } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
  };
  const status = (req.query as { status?: string }).status ?? 'all';

  const where: Prisma.UserWhereInput = { role: 'STUDENT' };
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { studentCode: { contains: search } },
    ];
  }

  const [total, students] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: authSelect,
    }),
  ]);

  return sendSuccess(
    res,
    students.map((student) => publicUser(student)),
    200,
    undefined,
    buildPageMeta(page, limit, total),
  );
}

/** GET /api/admin/students/:id - profile plus the student's reminders. */
export async function getStudent(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  const student = await prisma.user.findFirst({
    where: { id, role: 'STUDENT' },
    select: authSelect,
  });
  if (!student) throw notFound('Student not found');

  const [notifications, remindersReceived] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.deadlineReminder.count({ where: { userId: id } }),
  ]);

  return sendSuccess(res, {
    student: publicUser(student),
    notifications,
    remindersReceived,
  });
}

/** PUT /api/admin/students/:id */
export async function updateStudent(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const input = req.body as UpdateStudentInput;

  const student = await prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
  if (!student) throw notFound('Student not found');

  if (input.email && input.email !== student.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (clash) throw conflict('Another user already uses this email address');
  }
  if (input.studentCode) {
    const clash = await prisma.user.findUnique({
      where: { studentCode: input.studentCode },
      select: { id: true },
    });
    if (clash && clash.id !== id) throw conflict('This student code is already in use');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.studentCode !== undefined ? { studentCode: input.studentCode } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined
        ? { passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS) }
        : {}),
    },
    select: authSelect,
  });

  const message =
    input.isActive === false
      ? 'Student deactivated'
      : input.isActive === true
        ? 'Student reactivated'
        : 'Student updated';

  return sendSuccess(res, { student: publicUser(updated) }, 200, message);
}

/**
 * DELETE /api/admin/students/:id
 *
 * Defaults to a SOFT delete (deactivation). Pass ?hard=true to permanently
 * remove the account.
 */
export async function deleteStudent(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const hard = (req.query as { hard?: string }).hard === 'true';

  const student = await prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
  if (!student) throw notFound('Student not found');

  if (hard) {
    await prisma.user.delete({ where: { id } });
    return sendSuccess(res, null, 200, 'Student permanently deleted');
  }

  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return sendSuccess(
    res,
    { student: publicUser({ ...student, isActive: false }) },
    200,
    'Student deactivated',
  );
}

/** POST /api/admin/students/:id/reset-password */
export async function resetStudentPassword(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { password } = req.body as { password: string };

  if (!password || password.length < 8) {
    throw badRequest('The new password must be at least 8 characters');
  }

  const student = await prisma.user.findFirst({ where: { id, role: 'STUDENT' } });
  if (!student) throw notFound('Student not found');

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
  });

  return sendSuccess(res, null, 200, 'Password reset');
}

/** GET /api/admin/students/export - CSV export of the roster. */
export async function exportStudents(_req: Request, res: Response) {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    orderBy: { name: 'asc' },
    select: { name: true, email: true, studentCode: true, isActive: true, createdAt: true },
  });

  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = 'Name,Email,Student Code,Status,Registered';
  const rows = students.map((s) =>
    [
      escape(s.name),
      escape(s.email),
      escape(s.studentCode),
      escape(s.isActive ? 'Active' : 'Inactive'),
      escape(s.createdAt.toISOString()),
    ].join(','),
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="classhub-students.csv"');
  return res.send([header, ...rows].join('\n'));
}
