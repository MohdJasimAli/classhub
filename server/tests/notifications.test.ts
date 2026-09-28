import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import {
  api,
  cleanup,
  createAndLogin,
  createResource,
  createUser,
  DAY,
  sendResource,
} from './helpers.js';

describe('Notification centre', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function publishTo(studentToken: string) {
    const admin = await createAndLogin('ADMIN');
    const response = await sendResource('post', '/api/resources', admin.token, {
      type: 'QUIZ',
      title: 'Fresh material',
      questionText: 'Q?',
      answerText: 'A.',
      lastDate: new Date(Date.now() + DAY).toISOString(),
      isPublished: 'true',
    });
    void studentToken;
    return response.body.data.id as string;
  }

  it('lists notifications with an unread count', async () => {
    const student = await createAndLogin('STUDENT');
    await publishTo(student.token);

    const response = await api()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.unreadCount).toBe(1);
    expect(response.body.data.items[0].title).toContain('Fresh material');
  });

  it('marks one notification read, idempotently', async () => {
    const student = await createAndLogin('STUDENT');
    await publishTo(student.token);

    const list = await api().get('/api/notifications').set('Authorization', `Bearer ${student.token}`);
    const id = list.body.data.items[0].id;

    const first = await api()
      .patch(`/api/notifications/${id}/read`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.unreadCount).toBe(0);

    const again = await api()
      .patch(`/api/notifications/${id}/read`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(again.status).toBe(200);
    expect(again.body.data.unreadCount).toBe(0);
  });

  it('marks a notification unread again', async () => {
    const student = await createAndLogin('STUDENT');
    await publishTo(student.token);

    const list = await api().get('/api/notifications').set('Authorization', `Bearer ${student.token}`);
    const id = list.body.data.items[0].id;

    await api().patch(`/api/notifications/${id}/read`).set('Authorization', `Bearer ${student.token}`);
    const response = await api()
      .patch(`/api/notifications/${id}/unread`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it('marks everything as read at once', async () => {
    const student = await createAndLogin('STUDENT');
    await publishTo(student.token);
    await publishTo(student.token);

    const response = await api()
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.unreadCount).toBe(0);

    const after = await api()
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${student.token}`);
    expect(after.body.data.count).toBe(0);
  });

  it('refuses to let one student touch another student notification', async () => {
    const owner = await createAndLogin('STUDENT');
    const attacker = await createAndLogin('STUDENT');
    await publishTo(owner.token);

    const list = await api().get('/api/notifications').set('Authorization', `Bearer ${owner.token}`);
    const ownerId = list.body.data.items[0].id;

    const response = await api()
      .patch(`/api/notifications/${ownerId}/read`)
      .set('Authorization', `Bearer ${attacker.token}`);
    expect(response.status).toBe(404);

    // And it really was untouched.
    const row = await prisma.notification.findUnique({ where: { id: ownerId } });
    expect(row?.readAt).toBeNull();
  });

  it('deletes a notification', async () => {
    const student = await createAndLogin('STUDENT');
    await publishTo(student.token);

    const list = await api().get('/api/notifications').set('Authorization', `Bearer ${student.token}`);
    const id = list.body.data.items[0].id;

    const response = await api()
      .delete(`/api/notifications/${id}`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(response.status).toBe(200);
    expect(await prisma.notification.count({ where: { id } })).toBe(0);
  });
});

describe('Test email diagnostics', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('sends a diagnostic message to the signed-in admin and reports the transport', async () => {
    const admin = await createAndLogin('ADMIN');

    const response = await api()
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.sent).toBe(true);
    // The test suite never configures SMTP, so the transport must say CAPTURE.
    // This is the whole point: "sent" alone would be misleading.
    expect(response.body.data.transport.mode).toBe('CAPTURE');
    expect(response.body.data.transport.delivered).toBe(false);
    expect(response.body.data.transport.host).toBe('(not configured)');

    // Every attempt is auditable.
    const logged = await prisma.emailLog.findMany({
      where: { toEmail: admin.email, template: 'TEST_EMAIL' },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]!.status).toBe('SENT');
    expect(logged[0]!.subject).toContain('outbound email test');
  });

  it('refuses a student', async () => {
    const student = await createAndLogin('STUDENT');
    const response = await api()
      .post('/api/notifications/test-email')
      .set('Authorization', `Bearer ${student.token}`);
    expect(response.status).toBe(403);
  });

  it('requires authentication', async () => {
    const response = await api().post('/api/notifications/test-email');
    expect(response.status).toBe(401);
  });
});

describe('Dashboards', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('returns an admin-shaped dashboard', async () => {
    const admin = await createAndLogin('ADMIN');
    await createAndLogin('STUDENT');
    await createResource(admin.id, { lastDate: new Date(Date.now() + 2 * DAY) });
    await createResource(admin.id, { isPublished: false });

    const response = await api().get('/api/dashboard').set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('ADMIN');
    expect(response.body.data.stats.totalStudents).toBe(1);
    expect(response.body.data.stats.totalResources).toBe(2);
    expect(response.body.data.stats.publishedResources).toBe(1);
    expect(response.body.data.stats.draftResources).toBe(1);
    // The admin view counts drafts too, so both items fall inside the window.
    expect(response.body.data.upcoming.length).toBe(2);
    // ...and both are reachable from the "all material" table.
    expect(response.body.data.all.length).toBe(2);
  });

  it('returns a student-shaped dashboard that hides drafts', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    await createResource(admin.id, { title: 'Visible material', lastDate: new Date(Date.now() + 2 * DAY) });
    await createResource(admin.id, { title: 'Hidden draft', isPublished: false });

    const response = await api().get('/api/dashboard').set('Authorization', `Bearer ${student.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('STUDENT');
    expect(response.body.data.stats.totalResources).toBe(1);
    const titles = (response.body.data.all as Array<{ title: string }>).map((r) => r.title);
    expect(titles).toContain('Visible material');
    expect(titles).not.toContain('Hidden draft');
  });
});

describe('Student management', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates, edits, searches, deactivates and deletes a student', async () => {
    const admin = await createAndLogin('ADMIN');

    const created = await api()
      .post('/api/auth/students')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Managed Student', email: 'managed@test.local', password: 'Managed@123', studentCode: 'MGT-001' });
    expect(created.status).toBe(201);
    const studentId = created.body.data.student.id;

    const duplicate = await api()
      .post('/api/auth/students')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Clash', email: 'managed@test.local', password: 'Managed@123' });
    expect(duplicate.status).toBe(409);

    const edited = await api()
      .put(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Renamed Student' });
    expect(edited.body.data.student.name).toBe('Renamed Student');

    const searched = await api()
      .get('/api/admin/students?search=Renamed')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(searched.body.data.length).toBe(1);

    // Soft delete: the row survives, deactivated.
    const deactivated = await api()
      .delete(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.student.isActive).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: studentId } })).not.toBeNull();

    const reactivated = await api()
      .put(`/api/admin/students/${studentId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isActive: true });
    expect(reactivated.body.data.student.isActive).toBe(true);

    const destroyed = await api()
      .delete(`/api/admin/students/${studentId}?hard=true`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(destroyed.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: studentId } })).toBeNull();
  });

  it('exports the roster as CSV', async () => {
    const admin = await createAndLogin('ADMIN');
    await createUser('STUDENT', { name: 'Csv Person', studentCode: 'CSV-001' });

    const response = await api()
      .get('/api/admin/students/export')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.text).toContain('Name,Email,Student Code');
    expect(response.text).toContain('Csv Person');
  });
});

describe('Error handling', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('returns a structured 404 for an unknown route', async () => {
    const response = await api().get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns a structured 400 for malformed JSON', async () => {
    const response = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('returns 404 for a resource that does not exist', async () => {
    const admin = await createAndLogin('ADMIN');
    const response = await api()
      .get('/api/resources/nope')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(response.status).toBe(404);
  });
});
