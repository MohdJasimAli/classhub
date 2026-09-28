import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

/**
 * Shared test helpers: an app instance plus a small set of factories for the
 * users and resources the specs need.
 */

export const app: Application = createApp();

export const api = () => request(app);

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'STUDENT';
  token: string;
}

/** Creates a user directly in the database (bypassing the API). */
export async function createUser(
  role: 'ADMIN' | 'STUDENT',
  overrides: Partial<{ name: string; email: string; isActive: boolean; studentCode: string }> = {},
): Promise<{ id: string; email: string; name: string }> {
  const bcrypt = await import('bcryptjs');
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = overrides.email ?? `${role.toLowerCase()}-${suffix}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? `Test ${role}`,
      passwordHash: await bcrypt.default.hash('Test@12345', 4), // low rounds: tests only
      role,
      isActive: overrides.isActive ?? true,
      studentCode: overrides.studentCode ?? null,
    },
  });
  return { id: user.id, email: user.email, name: user.name };
}

/** Creates a user and signs them in, returning the bearer token. */
export async function createAndLogin(
  role: 'ADMIN' | 'STUDENT',
  overrides: Parameters<typeof createUser>[1] = {},
): Promise<TestUser> {
  const user = await createUser(role, overrides);
  const response = await api()
    .post('/api/auth/login')
    .send({ email: user.email, password: 'Test@12345' });
  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${user.email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return { ...user, role, token: response.body.data.token };
}

export interface ResourceOverrides {
  type?: 'QUIZ' | 'ASSIGNMENT';
  title?: string;
  description?: string | null;
  questionText?: string | null;
  answerText?: string | null;
  lastDate?: Date;
  isPublished?: boolean;
}

/** Creates a resource directly in the database. */
export async function createResource(adminId: string, overrides: ResourceOverrides = {}) {
  return prisma.resource.create({
    data: {
      type: overrides.type ?? 'QUIZ',
      title: overrides.title ?? `Resource ${Math.random().toString(36).slice(2, 7)}`,
      description: overrides.description ?? 'Test resource',
      questionText: overrides.questionText === undefined ? 'What is 2 + 2?' : overrides.questionText,
      answerText: overrides.answerText === undefined ? 'B - 4' : overrides.answerText,
      lastDate: overrides.lastDate ?? new Date(Date.now() + 2 * DAY),
      isPublished: overrides.isPublished ?? true,
      createdById: adminId,
    },
  });
}

/** A minimal but genuinely valid PDF (1% is all the magic-byte check needs). */
export function validPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
}

export interface TestFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Builds a multipart/form-data body without pulling in a helper library.
 *
 * Framing matters: every part is
 *   `--boundary CRLF <headers> CRLF CRLF <content> CRLF`
 * and the body ends with `CRLF--boundary--CRLF`. Omitting the trailing CRLF
 * after a file's bytes leaves busboy unable to find the next delimiter, so it
 * reads the following part's headers as part of the file.
 */
export function multipart(
  fields: Record<string, string> = {},
  files: Record<string, TestFile> = {},
): { body: Buffer; contentType: string } {
  const boundary = `----classhubtest${Math.random().toString(36).slice(2)}`;
  const nl = '\r\n';

  const segments: Buffer[] = [];
  const push = (value: string | Buffer) => {
    segments.push(typeof value === 'string' ? Buffer.from(value, 'utf8') : value);
  };

  for (const [name, value] of Object.entries(fields)) {
    push(
      `--${boundary}${nl}` +
        `Content-Disposition: form-data; name="${name}"${nl}` +
        `${nl}` +
        `${value}${nl}`,
    );
  }

  for (const [name, file] of Object.entries(files)) {
    push(
      `--${boundary}${nl}` +
        `Content-Disposition: form-data; name="${name}"; filename="${file.filename}"${nl}` +
        `Content-Type: ${file.contentType}${nl}` +
        `${nl}`,
    );
    push(file.buffer);
    push(nl);
  }

  push(`--${boundary}--${nl}`);

  return {
    body: Buffer.concat(segments),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** POST/PUT a resource with the given text fields and optional files. */
export function sendResource(
  method: 'post' | 'put',
  path: string,
  token: string,
  fields: Record<string, string>,
  files: Record<string, TestFile> = {},
) {
  const { body, contentType } = multipart(fields, files);
  const request = api()[method](path)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', contentType);
  return request.send(body);
}

export async function cleanup() {
  await prisma.deadlineReminder.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.user.deleteMany();
}
