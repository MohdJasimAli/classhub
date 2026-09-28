import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import {
  api,
  cleanup,
  createAndLogin,
  createResource,
  DAY,
  HOUR,
  sendResource,
  validPdfBuffer,
} from './helpers.js';

describe('Resources: question, answer and last date', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates a resource from text alone', async () => {
    const admin = await createAndLogin('ADMIN');

    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'Database Mid-Term',
      description: 'Revision material',
      questionText: '1. What is 2 + 2?',
      answerText: '1. B - 4',
      lastDate: new Date(Date.now() + 5 * DAY).toISOString(),
      isPublished: 'true',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe('Database Mid-Term');
    expect(response.body.data.type).toBe('QUIZ');
    expect(response.body.data.hasQuestion).toBe(true);
    expect(response.body.data.hasAnswer).toBe(true);
    expect(response.body.data.isPublished).toBe(true);
    expect(response.body.data.questionText).toContain('2 + 2');
    expect(response.body.data.answerText).toContain('B - 4');
  });

  it('accepts a multipart boolean for isPublished', async () => {
    // multipart/form-data delivers everything as a string, so the boolean
    // coercion in the validator is what makes this work.
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'ASSIGNMENT',
      title: 'Assignment material',
      questionText: 'Q?',
      answerText: 'A.',
      lastDate: new Date(Date.now() + DAY).toISOString(),
      isPublished: 'true',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.isPublished).toBe(true);
  });

  it('requires a question', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'No question here',
      answerText: 'But there is an answer',
      lastDate: new Date(Date.now() + DAY).toISOString(),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/question/i);
  });

  it('requires an answer', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'No answer here',
      questionText: 'But there is a question',
      lastDate: new Date(Date.now() + DAY).toISOString(),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/answer/i);
  });

  it('rejects a last date in the past', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'Already too late',
      questionText: 'Q?',
      answerText: 'A.',
      lastDate: new Date(Date.now() - DAY).toISOString(),
    });
    expect(response.status).toBe(422);
  });

  it('rejects a title that is too short', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'ab',
      questionText: 'Q?',
      answerText: 'A.',
      lastDate: new Date(Date.now() + DAY).toISOString(),
    });
    expect(response.status).toBe(422);
  });

  it('uploads a question file and an answer file together', async () => {
    const admin = await createAndLogin('ADMIN');

    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      {
        type: 'ASSIGNMENT',
        title: 'Material with files',
        lastDate: new Date(Date.now() + DAY).toISOString(),
      },
      {
        questionFile: { buffer: validPdfBuffer(), filename: 'question paper.pdf', contentType: 'application/pdf' },
        answerFile: { buffer: validPdfBuffer(), filename: 'model answer.pdf', contentType: 'application/pdf' },
      },
    );

    expect(response.status).toBe(201);
    expect(response.body.data.questionFile.name).toBe('question paper.pdf');
    expect(response.body.data.answerFile.name).toBe('model answer.pdf');
    // Stored names are generated, never the original.
    // The API returns a path relative to its own root; the client composes
    // the absolute URL because it alone knows the deployment base.
    expect(response.body.data.questionFile.url).toMatch(/^\/files\/\d+-[0-9a-f-]{36}\.pdf$/);
    expect(response.body.data.answerFile.url).not.toBe(response.body.data.questionFile.url);
    expect(response.body.data.hasQuestion).toBe(true);
    expect(response.body.data.hasAnswer).toBe(true);
  });

  it('reports a coherent last-date phase for every time state', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');

    const soon = await createResource(admin.id, { lastDate: new Date(Date.now() + 2 * HOUR) });
    const comfortable = await createResource(admin.id, { lastDate: new Date(Date.now() + 10 * DAY) });
    const past = await createResource(admin.id, { lastDate: new Date(Date.now() - DAY) });

    const read = async (id: string) =>
      (await api().get(`/api/resources/${id}`).set('Authorization', `Bearer ${student.token}`)).body.data;

    expect((await read(soon.id)).phase).toBe('CRITICAL');
    expect((await read(comfortable.id)).phase).toBe('OPEN');
    expect((await read(past.id)).phase).toBe('EXPIRED');
    expect((await read(past.id)).past).toBe(true);
  });

  it('edits the content and the last date', async () => {
    const admin = await createAndLogin('ADMIN');
    const resource = await createResource(admin.id);
    const newDate = new Date(Date.now() + 9 * DAY);

    const response = await sendResource('put', `/api/resources/${resource.id}`, admin.token, {
      title: 'Renamed material',
      answerText: 'A completely new answer',
      lastDate: newDate.toISOString(),
    });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Renamed material');
    expect(response.body.data.answerText).toBe('A completely new answer');
    expect(new Date(response.body.data.lastDate).getTime()).toBe(newDate.getTime());
  });

  it('replaces a file and removes the superseded one from disk', async () => {
    const admin = await createAndLogin('ADMIN');

    const created = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      {
        type: 'QUIZ',
        title: 'File swap material',
        questionText: 'Q?',
        answerText: 'A.',
        lastDate: new Date(Date.now() + DAY).toISOString(),
      },
      { questionFile: { buffer: validPdfBuffer(), filename: 'first.pdf', contentType: 'application/pdf' } },
    );

    const firstUrl: string = created.body.data.questionFile.url;
    const firstStored = path.basename(firstUrl);
    const firstAbsolute = path.join(env.paths.uploads, 'attachments', firstStored);
    expect(fs.existsSync(firstAbsolute)).toBe(true);

    const updated = await sendResource(
      'put',
      `/api/resources/${created.body.data.id}`,
      admin.token,
      { lastDate: new Date(Date.now() + 2 * DAY).toISOString() },
      { questionFile: { buffer: validPdfBuffer(), filename: 'second.pdf', contentType: 'application/pdf' } },
    );

    expect(updated.status).toBe(200);
    expect(updated.body.data.questionFile.name).toBe('second.pdf');
    expect(path.basename(updated.body.data.questionFile.url)).not.toBe(firstStored);
    // The old file is cleaned up.
    expect(fs.existsSync(firstAbsolute)).toBe(false);
  });

  it('publishes and unpublishes', async () => {
    const admin = await createAndLogin('ADMIN');
    const resource = await createResource(admin.id, { isPublished: false });

    // This endpoint is JSON-only (no file is involved in a publish toggle).
    const published = await api()
      .patch(`/api/resources/${resource.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isPublished: true });
    expect(published.status).toBe(200);
    expect(published.body.data.isPublished).toBe(true);

    const unpublished = await api()
      .patch(`/api/resources/${resource.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isPublished: false });
    expect(unpublished.status).toBe(200);
    expect(unpublished.body.data.isPublished).toBe(false);
  });

  it('refuses to publish a resource that has no answer', async () => {
    const admin = await createAndLogin('ADMIN');
    const resource = await createResource(admin.id, { answerText: null, isPublished: false });

    const response = await api()
      .patch(`/api/resources/${resource.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isPublished: true });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/answer/i);
  });

  it('deletes a resource and its stored files', async () => {
    const admin = await createAndLogin('ADMIN');

    const created = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      {
        type: 'QUIZ',
        title: 'Doomed material',
        questionText: 'Q?',
        answerText: 'A.',
        lastDate: new Date(Date.now() + DAY).toISOString(),
      },
      { answerFile: { buffer: validPdfBuffer(), filename: 'gone.pdf', contentType: 'application/pdf' } },
    );

    const id = created.body.data.id;
    const stored = path.basename(created.body.data.answerFile.url);
    const absolute = path.join(env.paths.uploads, 'attachments', stored);
    expect(fs.existsSync(absolute)).toBe(true);

    const deleted = await api()
      .delete(`/api/resources/${id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(deleted.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fs.existsSync(absolute)).toBe(false);
    expect(await prisma.resource.findUnique({ where: { id } })).toBeNull();
  });

  it('notifies students when something is published', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');

    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'Freshly published',
      questionText: 'Q?',
      answerText: 'A.',
      lastDate: new Date(Date.now() + DAY).toISOString(),
      isPublished: 'true',
    });

    const notification = await prisma.notification.findFirst({
      where: { userId: student.id, resourceId: response.body.data.id },
    });
    expect(notification).not.toBeNull();
    expect(notification!.type).toBe('DEADLINE_UPCOMING');
    expect(notification!.link).toBe(`/student/resources/${response.body.data.id}`);
  });

  it('filters by type and by last date', async () => {
    const admin = await createAndLogin('ADMIN');
    await createResource(admin.id, { type: 'QUIZ', title: 'A quiz item' });
    await createResource(admin.id, { type: 'ASSIGNMENT', title: 'An assignment item' });
    await createResource(admin.id, { title: 'Already past', lastDate: new Date(Date.now() - DAY) });

    const quizzes = await api()
      .get('/api/resources?type=QUIZ')
      .set('Authorization', `Bearer ${admin.token}`);
    expect((quizzes.body.data as Array<{ type: string }>).every((r) => r.type === 'QUIZ')).toBe(true);

    const open = await api()
      .get('/api/resources?status=upcoming')
      .set('Authorization', `Bearer ${admin.token}`);
    expect((open.body.data as Array<{ past: boolean }>).every((r) => !r.past)).toBe(true);
  });
  it('returns file paths that resolve against the API root, not a doubled prefix', async () => {
    // Regression guard: the API must return "/files/<name>", never
    // "/api/files/<name>", because the client prepends its own base URL.
    // A doubled prefix produced 404s on every download.
    const admin = await createAndLogin('ADMIN');

    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      { type: 'QUIZ', title: 'Path shape', questionText: 'What is 2 + 2?', lastDate: new Date(Date.now() + DAY).toISOString() },
      { answerFile: { buffer: validPdfBuffer(), filename: 'shape.pdf', contentType: 'application/pdf' } },
    );

    expect(response.status).toBe(201);

    const url: string = response.body.data.answerFile.url;
    expect(url.startsWith('/api/')).toBe(false);
    expect(url).toMatch(/^\/files\/[^/]+$/);

    // Composing it the way the client does must yield exactly one /api.
    const composed = `/api${url}`;
    expect(composed).not.toContain('/api/api/');
    expect(composed).toMatch(/^\/api\/files\/[^/]+$/);

    // And the composed path is a real, downloadable route.
    const download = await api()
      .get(composed)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(download.status).toBe(200);
  });
});

describe('Upload security', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('rejects a disallowed extension', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      { type: 'QUIZ', title: 'Bad extension', lastDate: new Date(Date.now() + DAY).toISOString() },
      { answerFile: { buffer: Buffer.from('MZ'), filename: 'malware.exe', contentType: 'application/octet-stream' } },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not allowed/i);
  });

  it('rejects a file whose contents contradict its extension', async () => {
    const admin = await createAndLogin('ADMIN');
    // A Windows PE executable renamed to .pdf.
    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      { type: 'QUIZ', title: 'Disguised file', lastDate: new Date(Date.now() + DAY).toISOString() },
      {
        answerFile: {
          buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]),
          filename: 'totally-a-document.pdf',
          contentType: 'application/pdf',
        },
      },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/contents/i);
  });

  it('rejects a declared MIME type that contradicts the extension', async () => {
    const admin = await createAndLogin('ADMIN');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      { type: 'QUIZ', title: 'Mismatched mime', lastDate: new Date(Date.now() + DAY).toISOString() },
      { answerFile: { buffer: png, filename: 'image.png', contentType: 'application/pdf' } },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/content type/i);
  });

  it('rejects a file over the size limit', async () => {
    const admin = await createAndLogin('ADMIN');
    const tooBig = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(env.maxFileSizeBytes + 1024, 0x20)]);

    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      { type: 'QUIZ', title: 'Huge file', lastDate: new Date(Date.now() + DAY).toISOString() },
      { answerFile: { buffer: tooBig, filename: 'huge.pdf', contentType: 'application/pdf' } },
    );

    expect(response.status).toBe(413);
  });

  it('never uses the original filename on disk', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource(
      'post',
      '/api/resources',
      admin.token,
      {
        type: 'QUIZ',
        title: 'Traversal attempt',
        questionText: 'What is 2 + 2?',
        lastDate: new Date(Date.now() + DAY).toISOString(),
      },
      {
        answerFile: {
          buffer: validPdfBuffer(),
          filename: '../../etc/passwd Report (final).pdf',
          contentType: 'application/pdf',
        },
      },
    );

    expect(response.status).toBe(201);
    const url: string = response.body.data.answerFile.url;
    expect(url).toMatch(/^\/files\/\d+-[0-9a-f-]{36}\.pdf$/);
    expect(url).not.toContain('..');
    expect(url).not.toContain('/passwd');
    // The sanitised display name is kept for the UI.
    expect(response.body.data.answerFile.name).toContain('passwd Report (final).pdf');
  });
});

describe('File access control', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function uploadFor(adminToken: string, published: boolean) {
    const response = await sendResource(
      'post',
      '/api/resources',
      adminToken,
      {
        type: 'QUIZ',
        title: 'File material',
        questionText: 'What is 2 + 2?',
        lastDate: new Date(Date.now() + DAY).toISOString(),
        isPublished: String(published),
      },
      { answerFile: { buffer: validPdfBuffer(), filename: 'answers.pdf', contentType: 'application/pdf' } },
    );
    expect(response.status).toBe(201);
    return response.body.data as { id: string; answerFile: { url: string } };
  }

  it('lets a student download a file on a published resource', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await uploadFor(admin.token, true);

    const response = await api()
      .get(`/api${resource.answerFile.url}`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('blocks a student from a file on an unpublished resource', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await uploadFor(admin.token, false);

    const response = await api()
      .get(`/api${resource.answerFile.url}`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(response.status).toBe(400);
  });

  it('lets an admin download any file', async () => {
    const admin = await createAndLogin('ADMIN');
    const resource = await uploadFor(admin.token, false);

    const response = await api()
      .get(`/api${resource.answerFile.url}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(response.status).toBe(200);
  });

  it('requires authentication', async () => {
    const admin = await createAndLogin('ADMIN');
    const resource = await uploadFor(admin.token, true);

    const response = await api().get(`/api${resource.answerFile.url}`);
    expect(response.status).toBe(401);
  });

  it('refuses path traversal', async () => {
    const admin = await createAndLogin('ADMIN');
    for (const attempt of ['..%2F..%2F.env', '..%2F..%2F..%2Fpackage.json', '%2Fetc%2Fpasswd']) {
      const response = await api()
        .get(`/api/files/${attempt}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(response.status, attempt).toBeGreaterThanOrEqual(400);
    }
  });

  it('returns 404 for an unknown file', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await api()
      .get('/api/files/0000000000-00000000-0000-0000-000000000000.pdf')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(response.status).toBe(404);
  });
});
