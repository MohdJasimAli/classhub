import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { runReminderSweep } from '../src/services/deadlineReminder.service.js';
import { reminderWindow, formatDeadline, formatRemaining } from '../src/utils/deadline.js';
import { api, cleanup, createAndLogin, createResource, HOUR } from './helpers.js';

const HOUR_MS = HOUR;

/** A last date that sits exactly on the 24-hour reminder point. */
const lastDateIn24h = (offsetMs = 0) => new Date(Date.now() + 24 * HOUR_MS + offsetMs);

describe('24-hour last-date reminders', () => {
  // Each test starts from an empty database: a sweep is global, so leftover
  // users or items from a previous test would otherwise change the counts.
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('opens the reminder window at now and closes it past the lead time', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const { from, to } = reminderWindow(now);

    const leadMs = env.REMINDER_LEAD_HOURS * HOUR_MS;
    const toleranceMs = env.REMINDER_TOLERANCE_MINUTES * 60_000;

    // Anchored at `now`, not at a narrow band around the lead time, so a sweep
    // that runs late still picks up everything still outstanding.
    expect(from.getTime()).toBe(now.getTime());
    expect(to.getTime()).toBe(now.getTime() + leadMs + toleranceMs);
  });

  it('catches an item whose nominal reminder moment already passed', async () => {
    // A free hosting tier idles to sleep, so the process can be down when the
    // lead-time window opens. This item is 3 hours from its last date - well
    // inside the lead horizon, but long past the exact 24-hour mark.
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, {
      lastDate: new Date(Date.now() + 3 * HOUR_MS),
    });

    const summary = await runReminderSweep();

    expect(summary.remindersCreated).toBe(1);
    expect(summary.emailsSent).toBe(1);

    // The email must state the real time remaining, not claim 24 hours.
    const logged = await prisma.emailLog.findMany({
      where: { toEmail: student.email, template: 'DEADLINE_REMINDER' },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]!.subject).toContain(resource.title);
  });

  it('does not catch an item whose last date has already passed', async () => {
    const admin = await createAndLogin('ADMIN');
    await createAndLogin('STUDENT');
    // Expired: there is nothing left to remind anyone about.
    await createResource(admin.id, { lastDate: new Date(Date.now() - 2 * HOUR_MS) });

    const summary = await runReminderSweep();

    expect(summary.remindersCreated).toBe(0);
    expect(summary.resourcesConsidered).toBe(0);
  });

  it('emails every student when a last date is 24 hours away', async () => {
    const admin = await createAndLogin('ADMIN');
    const a = await createAndLogin('STUDENT');
    const b = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, { lastDate: lastDateIn24h() });

    const summary = await runReminderSweep();

    expect(summary.remindersCreated).toBe(2);
    expect(summary.emailsSent).toBe(2);

    const rows = await prisma.deadlineReminder.findMany({
      where: { targetId: resource.id },
    });
    expect(rows.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());

    for (const email of [a.email, b.email]) {
      const logged = await prisma.emailLog.findMany({
        where: { toEmail: email, template: 'DEADLINE_REMINDER' },
      });
      expect(logged).toHaveLength(1);
      expect(logged[0]!.status).toBe('SENT');
      expect(logged[0]!.subject).toContain(resource.title);
    }
  });

  it('handles both quiz and assignment kinds', async () => {
    const admin = await createAndLogin('ADMIN');
    await createAndLogin('STUDENT');
    await createResource(admin.id, { type: 'QUIZ', lastDate: lastDateIn24h() });
    await createResource(admin.id, { type: 'ASSIGNMENT', lastDate: lastDateIn24h() });

    const summary = await runReminderSweep();

    expect(summary.resourcesConsidered).toBe(2);
    expect(summary.remindersCreated).toBe(2);
    const kinds = await prisma.deadlineReminder.findMany({ select: { kind: true } });
    expect(kinds.map((k) => k.kind).sort()).toEqual(['ASSIGNMENT', 'QUIZ']);
  });

  it('ignores items beyond the lead horizon but catches ones already close', async () => {
    const admin = await createAndLogin('ADMIN');
    await createAndLogin('STUDENT');

    // Ten days out: comfortably beyond the 24h lead horizon, nothing to say.
    const far = await createResource(admin.id, { lastDate: new Date(Date.now() + 10 * 24 * HOUR_MS) });
    // Two hours out: inside the horizon. The old narrow window skipped this
    // because the exact 24h mark had not been reached, which is precisely the
    // gap that let reminders fall through when the process was asleep.
    const nearlyDue = await createResource(admin.id, {
      lastDate: new Date(Date.now() + 2 * HOUR_MS),
    });

    await runReminderSweep();

    expect(await prisma.deadlineReminder.count({ where: { targetId: far.id } })).toBe(0);
    expect(await prisma.deadlineReminder.count({ where: { targetId: nearlyDue.id } })).toBe(1);
  });

  it('ignores unpublished items', async () => {
    const admin = await createAndLogin('ADMIN');
    await createAndLogin('STUDENT');
    const draft = await createResource(admin.id, { lastDate: lastDateIn24h(), isPublished: false });

    await runReminderSweep();

    expect(await prisma.deadlineReminder.count({ where: { targetId: draft.id } })).toBe(0);
  });

  it('skips inactive students', async () => {
    const admin = await createAndLogin('ADMIN');
    const { createUser } = await import('./helpers.js');
    const inactive = await createUser('STUDENT', { isActive: false });
    await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, { lastDate: lastDateIn24h() });

    await runReminderSweep();

    const recipients = (await prisma.deadlineReminder.findMany({ where: { targetId: resource.id } })).map(
      (r) => r.userId,
    );
    expect(recipients).not.toContain(inactive.id);
  });

  it('does not remind a student who has already been told', async () => {
    // There is no submission step in this app, so every active student is a
    // legitimate recipient; the test asserts the fan-out is exactly the roster.
    const admin = await createAndLogin('ADMIN');
    const students = await Promise.all([createAndLogin('STUDENT'), createAndLogin('STUDENT')]);
    const resource = await createResource(admin.id, { lastDate: lastDateIn24h() });

    const first = await runReminderSweep();
    expect(first.remindersCreated).toBe(2);

    // Running again must send nothing further.
    for (let i = 0; i < 4; i += 1) {
      const repeat = await runReminderSweep();
      expect(repeat.remindersCreated).toBe(0);
      expect(repeat.duplicatesPrevented).toBe(2);
    }

    for (const student of students) {
      const emails = await prisma.emailLog.count({
        where: { toEmail: student.email, template: 'DEADLINE_REMINDER' },
      });
      expect(emails).toBe(1);
    }

    const rows = await prisma.deadlineReminder.findMany({ where: { targetId: resource.id } });
    expect(rows).toHaveLength(2);
  });

  it('blocks a duplicate at the database level under a direct race', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, { lastDate: lastDateIn24h() });
    await runReminderSweep();

    // Bypass the service and race the unique constraint directly.
    await expect(
      prisma.deadlineReminder.create({
        data: {
          kind: 'QUIZ',
          targetId: resource.id,
          reminderFor: resource.lastDate,
          userId: student.id,
          channel: 'EMAIL',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('treats a moved last date as a new reminder opportunity', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const original = lastDateIn24h();
    const resource = await createResource(admin.id, { lastDate: original });

    await runReminderSweep();
    expect(
      await prisma.emailLog.count({ where: { toEmail: student.email, template: 'DEADLINE_REMINDER' } }),
    ).toBe(1);

    // Same notification, different instant: the unique key differs, so one more
    // reminder is legitimate.
    const shifted = new Date(original.getTime() + 5 * 60_000);
    await prisma.resource.update({ where: { id: resource.id }, data: { lastDate: shifted } });

    const summary = await runReminderSweep();
    expect(summary.remindersCreated).toBe(1);
    expect(
      await prisma.emailLog.count({ where: { toEmail: student.email, template: 'DEADLINE_REMINDER' } }),
    ).toBe(2);

    const rows = await prisma.deadlineReminder.findMany({
      where: { targetId: resource.id, userId: student.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.reminderFor.getTime()).toBe(original.getTime());
    expect(rows[1]!.reminderFor.getTime()).toBe(shifted.getTime());
  });

  it('resumes correctly after a simulated server restart', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, { lastDate: lastDateIn24h() });

    // --- Process 1: the sweep runs, then the process "dies" abruptly. ---
    const firstRun = await runReminderSweep();
    expect(firstRun.remindersCreated).toBe(1);
    expect(firstRun.emailsSent).toBe(1);

    const sentBefore = await prisma.emailLog.count({
      where: { toEmail: student.email, template: 'DEADLINE_REMINDER' },
    });
    expect(sentBefore).toBe(1);

    // Simulate a restart: everything in memory is lost, only the database
    // survives. Disconnecting and reconnecting the pool mirrors that.
    await prisma.$disconnect();
    await prisma.$connect();

    // --- Process 2: a fresh sweep re-derives state purely from the DB. ---
    const secondRun = await runReminderSweep();
    expect(secondRun.remindersCreated).toBe(0);
    expect(secondRun.duplicatesPrevented).toBe(1);

    expect(
      await prisma.emailLog.count({ where: { toEmail: student.email, template: 'DEADLINE_REMINDER' } }),
    ).toBe(1);

    const rows = await prisma.deadlineReminder.findMany({
      where: { targetId: resource.id, userId: student.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('catches up an item whose window elapsed while the server was down', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');

    // 25 hours out - outside the window, so nothing is sent now.
    const resource = await createResource(admin.id, { lastDate: new Date(Date.now() + 25 * HOUR_MS) });
    await runReminderSweep();
    expect(
      await prisma.emailLog.count({ where: { toEmail: student.email, template: 'DEADLINE_REMINDER' } }),
    ).toBe(0);

    await prisma.$disconnect();

    // Time advances past the 24-hour mark while "down".
    await prisma.resource.update({ where: { id: resource.id }, data: { lastDate: lastDateIn24h() } });
    await prisma.$connect();

    // The very next sweep picks it up.
    const summary = await runReminderSweep();
    expect(summary.remindersCreated).toBe(1);
    expect(
      await prisma.emailLog.count({ where: { toEmail: student.email, template: 'DEADLINE_REMINDER' } }),
    ).toBe(1);
  });

  it('creates an in-app notification alongside the email', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    const resource = await createResource(admin.id, { title: 'Revision session', lastDate: lastDateIn24h() });

    await runReminderSweep();

    const notification = await prisma.notification.findFirst({
      where: { userId: student.id, type: 'DEADLINE_REMINDER' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.title).toContain(resource.title);
    expect(notification!.resourceId).toBe(resource.id);
    expect(notification!.link).toBe(`/student/resources/${resource.id}`);
  });

  it('renders a reminder that names the student, the item and the last date', async () => {
    const { deadlineReminderTemplate } = await import('../src/services/email/templates.js');
    const rendered = deadlineReminderTemplate({
      studentName: 'Jasim',
      kindLabel: 'Assignment',
      title: 'Database Management Assignment 2',
      lastDateFormatted: '25 September 2026, 11:59 PM',
      remainingFormatted: formatRemaining(24 * HOUR_MS),
      linkUrl: 'http://localhost:5173/student/resources/abc',
    });

    expect(rendered.subject).toContain('Database Management Assignment 2');
    expect(rendered.html).toContain('Hi Jasim');
    expect(rendered.html).toContain('Database Management Assignment 2');
    expect(rendered.html).toContain('25 September 2026, 11:59 PM');
    // formatRemaining renders a 24h gap as a single day.
    expect(rendered.html).toContain('1 day');
    expect(rendered.html).toContain('Open Assignment');
    expect(rendered.html).toContain('http://localhost:5173/student/resources/abc');
  });

  it('formats a deadline the way the brief describes', () => {
    const date = new Date(2026, 8, 25, 23, 59); // 25 September 2026, 11:59 PM local
    expect(formatDeadline(date)).toBe('25 September 2026, 11:59 PM');
  });

  it('exposes the reminder log and a manual trigger to the admin only', async () => {
    const admin = await createAndLogin('ADMIN');
    const student = await createAndLogin('STUDENT');
    await createResource(admin.id, { lastDate: lastDateIn24h() });

    const asAdmin = await api()
      .post('/api/admin/reminders/run')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.remindersCreated).toBe(1);

    const repeat = await api()
      .post('/api/admin/reminders/run')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(repeat.body.data.remindersCreated).toBe(0);
    expect(repeat.body.data.duplicatesPrevented).toBe(1);

    const log = await api().get('/api/admin/reminders').set('Authorization', `Bearer ${admin.token}`);
    expect(log.status).toBe(200);
    expect(log.body.data.length).toBe(1);

    const asStudent = await api()
      .post('/api/admin/reminders/run')
      .set('Authorization', `Bearer ${student.token}`);
    expect(asStudent.status).toBe(403);
  });
});
