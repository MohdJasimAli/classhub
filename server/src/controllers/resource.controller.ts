import fs from 'node:fs';
import type { Request, Response } from 'express';
import { Prisma, type ResourceType } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { badRequest, notFound } from '../utils/errors.js';
import { buildPageMeta, sendCreated, sendSuccess } from '../utils/response.js';
import { currentUser } from '../middleware/auth.js';
import { removeStoredFile, resolveUploadPath, sanitizeDisplayName } from '../middleware/upload.js';
import { deadlinePhase, formatCountdown, formatDeadline } from '../utils/deadline.js';
import { notificationService } from '../services/notification.service.js';
import type {
  CreateResourceInput,
  UpdateResourceInput,
} from '../validators/resource.validator.js';

/** Fields multer may have written for a resource. */
interface UploadedFiles {
  questionFile?: Express.Multer.File;
  answerFile?: Express.Multer.File;
}

export interface ResourceRow {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  questionText: string | null;
  questionFileUrl: string | null;
  questionFileName: string | null;
  questionFileSize: number | null;
  answerText: string | null;
  answerFileUrl: string | null;
  answerFileName: string | null;
  answerFileSize: number | null;
  lastDate: Date;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One serialiser for the whole app, so the last-date phase, countdown and
 * file metadata are always presented identically to both roles.
 */
function present(resource: ResourceRow, now = new Date()) {
  const msRemaining = resource.lastDate.getTime() - now.getTime();
  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    description: resource.description,
    questionText: resource.questionText,
    questionFile: resource.questionFileUrl
      ? {
          name: resource.questionFileName,
          size: resource.questionFileSize,
          // A bare path, relative to the API root. The client composes the
          // final URL, because it alone knows whether VITE_API_URL is a
          // relative proxy path or an absolute cross-origin API.
          url: `/files/${resource.questionFileUrl}`,
        }
      : null,
    answerText: resource.answerText,
    answerFile: resource.answerFileUrl
      ? {
          name: resource.answerFileName,
          size: resource.answerFileSize,
          url: `/files/${resource.answerFileUrl}`,
        }
      : null,
    hasQuestion: Boolean(resource.questionText || resource.questionFileUrl),
    hasAnswer: Boolean(resource.answerText || resource.answerFileUrl),
    lastDate: resource.lastDate,
    lastDateFormatted: formatDeadline(resource.lastDate),
    isPublished: resource.isPublished,
    msRemaining,
    countdown: formatCountdown(msRemaining),
    phase: deadlinePhase({ deadline: resource.lastDate, now }),
    past: msRemaining < 0,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

function labelOf(type: ResourceType): 'Quiz' | 'Assignment' {
  return type === 'QUIZ' ? 'Quiz' : 'Assignment';
}

function filesOf(req: Request): UploadedFiles {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    questionFile: files?.questionFile?.[0],
    answerFile: files?.answerFile?.[0],
  };
}

// ---------------------------------------------------------------------------
// GET /api/resources
// ---------------------------------------------------------------------------
export async function listResources(req: Request, res: Response) {
  const user = currentUser(req);
  const { page, limit, search, type, status } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    type: string;
    status: string;
  };
  const now = new Date();

  const where: Prisma.ResourceWhereInput = {
    // Students only ever see published material.
    ...(user.role === 'STUDENT' ? { isPublished: true } : {}),
    ...(search
      ? { OR: [{ title: { contains: search } }, { description: { contains: search } }] }
      : {}),
  };

  if (type === 'QUIZ' || type === 'ASSIGNMENT') where.type = type;
  if (status === 'published') where.isPublished = true;
  if (status === 'draft') where.isPublished = false;
  if (status === 'upcoming') where.lastDate = { gt: now };
  if (status === 'past') where.lastDate = { lt: now };

  const [total, resources] = await Promise.all([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: [{ lastDate: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return sendSuccess(
    res,
    resources.map((resource) => present(resource, now)),
    200,
    undefined,
    buildPageMeta(page, limit, total),
  );
}

// ---------------------------------------------------------------------------
// GET /api/resources/:id
// ---------------------------------------------------------------------------
export async function getResource(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = req.params as { id: string };

  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) throw notFound('Resource not found');
  if (user.role === 'STUDENT' && !resource.isPublished) {
    // 404 rather than 403 so a student cannot probe for draft material.
    throw notFound('Resource not found');
  }

  return sendSuccess(res, present(resource));
}

// ---------------------------------------------------------------------------
// POST /api/resources  (admin, multipart)
// ---------------------------------------------------------------------------
export async function createResource(req: Request, res: Response) {
  const admin = currentUser(req);
  const input = req.body as CreateResourceInput;
  const { questionFile, answerFile } = filesOf(req);

  if (!input.questionText && !questionFile) {
    throw badRequest('Add the question as text, attach a question file, or both.');
  }
  if (!input.answerText && !answerFile) {
    throw badRequest('Add the answer as text, attach an answer file, or both.');
  }

  const resource = await prisma.resource.create({
    data: {
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      questionText: input.questionText ?? null,
      ...(questionFile
        ? {
            questionFileUrl: questionFile.filename,
            questionFileName: sanitizeDisplayName(questionFile.originalname),
            questionFileSize: questionFile.size,
            questionFileMime: questionFile.mimetype,
          }
        : {}),
      answerText: input.answerText ?? null,
      ...(answerFile
        ? {
            answerFileUrl: answerFile.filename,
            answerFileName: sanitizeDisplayName(answerFile.originalname),
            answerFileSize: answerFile.size,
            answerFileMime: answerFile.mimetype,
          }
        : {}),
      lastDate: input.lastDate,
      isPublished: input.isPublished,
      createdById: admin.id,
    },
  });

  if (resource.isPublished) await announceToStudents(resource, 'A new');

  return sendCreated(res, present(resource), 'Resource created');
}

// ---------------------------------------------------------------------------
// PUT /api/resources/:id  (admin, multipart)
// ---------------------------------------------------------------------------
export async function updateResource(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const input = req.body as UpdateResourceInput;
  const { questionFile, answerFile } = filesOf(req);

  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) throw notFound('Resource not found');

  // If both files are being removed in the same request, reject it: the
  // student must always be given something to read.
  const questionKept = questionFile || input.questionText !== undefined || existing.questionFileUrl;
  const answerKept = answerFile || input.answerText !== undefined || existing.answerFileUrl;
  if (!questionKept) throw badRequest('A resource needs a question (text or file).');
  if (!answerKept) throw badRequest('A resource needs an answer (text or file).');

  // A new file replaces the old one, so the superseded file is collected.
  const superseded: (string | null)[] = [];
  if (questionFile) superseded.push(existing.questionFileUrl);
  if (answerFile) superseded.push(existing.answerFileUrl);

  const resource = await prisma.resource.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.questionText !== undefined ? { questionText: input.questionText } : {}),
      ...(input.answerText !== undefined ? { answerText: input.answerText } : {}),
      ...(questionFile
        ? {
            questionFileUrl: questionFile.filename,
            questionFileName: sanitizeDisplayName(questionFile.originalname),
            questionFileSize: questionFile.size,
            questionFileMime: questionFile.mimetype,
          }
        : {}),
      ...(answerFile
        ? {
            answerFileUrl: answerFile.filename,
            answerFileName: sanitizeDisplayName(answerFile.originalname),
            answerFileSize: answerFile.size,
            answerFileMime: answerFile.mimetype,
          }
        : {}),
      ...(input.lastDate !== undefined ? { lastDate: input.lastDate } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
    },
  });

  for (const file of superseded) await removeStoredFile(file);

  // Publishing for the first time tells students it is available.
  if (!existing.isPublished && resource.isPublished) {
    await announceToStudents(resource, 'A new');
  }

  return sendSuccess(res, present(resource), 200, 'Resource updated');
}

// ---------------------------------------------------------------------------
// PATCH /api/resources/:id/publish  (admin)
// ---------------------------------------------------------------------------
export async function setResourcePublished(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const isPublished = Boolean((req.body as { isPublished?: unknown }).isPublished);

  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) throw notFound('Resource not found');

  if (isPublished) {
    if (!existing.questionText && !existing.questionFileUrl) {
      throw badRequest('Add a question before publishing.');
    }
    if (!existing.answerText && !existing.answerFileUrl) {
      throw badRequest('Add an answer before publishing.');
    }
  }

  const resource = await prisma.resource.update({ where: { id }, data: { isPublished } });

  if (isPublished && !existing.isPublished) {
    await announceToStudents(resource, 'A new');
  }

  return sendSuccess(
    res,
    present(resource),
    200,
    isPublished ? 'Published' : 'Unpublished',
  );
}

// ---------------------------------------------------------------------------
// DELETE /api/resources/:id  (admin)
// ---------------------------------------------------------------------------
export async function deleteResource(req: Request, res: Response) {
  const { id } = req.params as { id: string };

  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) throw notFound('Resource not found');

  // Removing the row cascades notifications; stored files need manual cleanup.
  await prisma.resource.delete({ where: { id } });
  await removeStoredFile(existing.questionFileUrl);
  await removeStoredFile(existing.answerFileUrl);

  return sendSuccess(res, null, 200, 'Resource deleted');
}

// ---------------------------------------------------------------------------
// GET /api/files/:filename  (authenticated download)
// ---------------------------------------------------------------------------

/**
 * Uploads are never served as a public static directory. Every download is
 * authorised here: admins may take anything, a student may take a file only if
 * it belongs to a published resource.
 */
export async function downloadFile(req: Request, res: Response) {
  const user = currentUser(req);
  const { filename } = req.params as { filename: string };

  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '');
  if (!safeName || safeName !== filename || safeName.includes('..')) {
    throw badRequest('Invalid filename');
  }

  const absolute = resolveUploadPath(safeName);
  if (!fs.existsSync(absolute)) throw notFound('File not found on the server');

  if (user.role !== 'ADMIN') {
    const visible = await prisma.resource.findFirst({
      where: {
        isPublished: true,
        OR: [{ questionFileUrl: safeName }, { answerFileUrl: safeName }],
      },
      select: { id: true },
    });
    if (!visible) throw badRequest('You do not have permission to download this file');
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(absolute, { dotfiles: 'deny' }, (error) => {
    if (error && !res.headersSent) res.status(500).end();
  });
}

// ---------------------------------------------------------------------------

async function announceToStudents(
  resource: ResourceRow,
  prefix: string,
): Promise<void> {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', isActive: true },
    select: { id: true },
  });

  await notificationService.createMany(students, {
    type: 'DEADLINE_UPCOMING',
    title: `${prefix} ${labelOf(resource.type).toLowerCase()}: ${resource.title}`,
    message: `The question and answer are available. Last date: ${formatDeadline(resource.lastDate)}.`,
    link: `/student/resources/${resource.id}`,
    resourceId: resource.id,
  });
}
