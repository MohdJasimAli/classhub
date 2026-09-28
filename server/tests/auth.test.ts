import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, cleanup, createAndLogin, createUser, createResource, DAY } from './helpers.js';

describe('Authentication', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('logs in a user with valid credentials and returns a token', async () => {
    const user = await createUser('STUDENT', { email: `login-${Date.now()}@test.local` });
    const response = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@12345' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe(user.email);
  });

  it('never returns the password hash', async () => {
    const user = await createUser('STUDENT', { email: `nohash-${Date.now()}@test.local` });
    const response = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@12345' });

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$2a$');
    expect(serialised).not.toContain('$2b$');
  });

  it('rejects a wrong password with 401', async () => {
    const user = await createUser('STUDENT', { email: `wrongpw-${Date.now()}@test.local` });
    const response = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });

    expect(response.status).toBe(401);
  });

  it('returns the same error for an unknown email (no account enumeration)', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'definitely-not-real@test.local', password: 'Test@12345' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Incorrect email or password');
  });

  it('refuses to authenticate a deactivated account', async () => {
    const user = await createUser('STUDENT', { email: `inactive-${Date.now()}@test.local`, isActive: false });
    const response = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@12345' });

    expect(response.status).toBe(403);
  });

  it('rejects a malformed or missing token', async () => {
    const bad = await api().get('/api/auth/me').set('Authorization', 'Bearer not.a.real.jwt');
    expect(bad.status).toBe(401);

    const missing = await api().get('/api/auth/me');
    expect(missing.status).toBe(401);
  });

  it('revokes access as soon as an account is deactivated', async () => {
    const session = await createAndLogin('STUDENT');

    const before = await api().get('/api/auth/me').set('Authorization', `Bearer ${session.token}`);
    expect(before.status).toBe(200);

    await prisma.user.update({ where: { id: session.id }, data: { isActive: false } });

    const after = await api().get('/api/auth/me').set('Authorization', `Bearer ${session.token}`);
    expect(after.status).toBe(403);
  });

  it('sets an httpOnly cookie', async () => {
    const user = await createUser('STUDENT', { email: `cookie-${Date.now()}@test.local` });
    const response = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@12345' });

    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.some((c) => c.includes('classhub_token') && c.includes('HttpOnly'))).toBe(true);
  });

  it('registers a student but never allows self-registering as an admin', async () => {
    const response = await api().post('/api/auth/register').send({
      name: 'Self Registered',
      email: `selfreg-${Date.now()}@test.local`,
      password: 'ValidPass1',
      role: 'ADMIN', // malicious client tries to escalate
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('STUDENT');
  });

  it('enforces password strength and rejects duplicates', async () => {
    const weak = await api()
      .post('/api/auth/register')
      .send({ name: 'Weak', email: `weak-${Date.now()}@test.local`, password: 'short' });
    expect(weak.status).toBe(422);

    const email = `dupe-${Date.now()}@test.local`;
    await api().post('/api/auth/register').send({ name: 'First', email, password: 'ValidPass1' });
    const second = await api()
      .post('/api/auth/register')
      .send({ name: 'Second', email, password: 'ValidPass1' });
    expect(second.status).toBe(409);
  });
});

describe('Role-based access control', () => {
  beforeEach(async () => {
    await cleanup();
  });

  it('blocks a student from every admin endpoint', async () => {
    const student = await createAndLogin('STUDENT');
    for (const path of [
      '/api/admin/students',
      '/api/admin/reminders',
    ]) {
      const response = await api().get(path).set('Authorization', `Bearer ${student.token}`);
      expect(response.status, path).toBe(403);
    }

    const runSweep = await api()
      .post('/api/admin/reminders/run')
      .set('Authorization', `Bearer ${student.token}`);
    expect(runSweep.status).toBe(403);
  });

  it('blocks a student from creating, editing and deleting resources', async () => {
    const student = await createAndLogin('STUDENT');

    const create = await api()
      .post('/api/resources')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Should not exist')
      .field('type', 'QUIZ')
      .field('lastDate', new Date(Date.now() + DAY).toISOString());
    expect(create.status).toBe(403);

    const update = await api()
      .put('/api/resources/anything')
      .set('Authorization', `Bearer ${student.token}`)
      .field('title', 'Nope');
    expect(update.status).toBe(403);

    const remove = await api()
      .delete('/api/resources/anything')
      .set('Authorization', `Bearer ${student.token}`);
    expect(remove.status).toBe(403);
  });

  it('blocks a student from publishing or unpublishing', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id);

    const response = await api()
      .patch(`/api/resources/${resource.id}/publish`)
      .set('Authorization', `Bearer ${student.token}`)
      .field('isPublished', 'false');
    expect(response.status).toBe(403);
  });

  it('allows an admin through the admin endpoints', async () => {
    const admin = await createAndLogin('ADMIN');
    for (const path of ['/api/admin/students', '/api/admin/reminders']) {
      const response = await api().get(path).set('Authorization', `Bearer ${admin.token}`);
      expect(response.status, path).toBe(200);
    }
  });

  it('only lists published resources to students', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    await createResource(admin.id, { title: 'Published material', isPublished: true });
    await createResource(admin.id, { title: 'Secret draft material', isPublished: false });

    const studentView = await api()
      .get('/api/resources?limit=100')
      .set('Authorization', `Bearer ${student.token}`);
    const studentTitles = (studentView.body.data as Array<{ title: string }>).map((r) => r.title);
    expect(studentTitles).toContain('Published material');
    expect(studentTitles).not.toContain('Secret draft material');

    const adminView = await api()
      .get('/api/resources?limit=100')
      .set('Authorization', `Bearer ${admin.token}`);
    const adminTitles = (adminView.body.data as Array<{ title: string }>).map((r) => r.title);
    expect(adminTitles).toContain('Secret draft material');
  });

  it('hides an unpublished resource from a student behind a 404', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const draft = await createResource(admin.id, { isPublished: false });

    const response = await api()
      .get(`/api/resources/${draft.id}`)
      .set('Authorization', `Bearer ${student.token}`);
    // 404 rather than 403, so a student cannot probe for draft material.
    expect(response.status).toBe(404);
  });
});
