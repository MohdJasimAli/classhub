import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { currentUser } from '../middleware/auth.js';
import {
  deadlinePhase,
  formatCountdown,
  formatDeadline,
  formatRemaining,
} from '../utils/deadline.js';
import { getReminderHistory, runReminderSweep } from '../services/deadlineReminder.service.js';

/** How far ahead the "upcoming last dates" panels look. */
const UPCOMING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function brief(resource: {
  id: string;
  type: 'QUIZ' | 'ASSIGNMENT';
  title: string;
  description: string | null;
  lastDate: Date;
  isPublished: boolean;
  questionText: string | null;
  questionFileUrl: string | null;
  answerText: string | null;
  answerFileUrl: string | null;
}, now: Date) {
  const msRemaining = resource.lastDate.getTime() - now.getTime();
  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    description: resource.description,
    lastDate: resource.lastDate,
    lastDateFormatted: formatDeadline(resource.lastDate),
    countdown: formatCountdown(msRemaining),
    remaining: formatRemaining(msRemaining),
    phase: deadlinePhase({ deadline: resource.lastDate, now }),
    isPublished: resource.isPublished,
    hasQuestion: Boolean(resource.questionText || resource.questionFileUrl),
    hasAnswer: Boolean(resource.answerText || resource.answerFileUrl),
  };
}

/**
 * GET /api/dashboard
 *
 * One role-shaped payload so the two dashboards cannot drift apart. The last
 * date is the only time concept in the product, and every card is derived from
 * it here rather than in the client.
 */
export async function getDashboard(req: Request, res: Response) {
  const user = currentUser(req);
  const now = new Date();
  const soon = new Date(now.getTime() + UPCOMING_WINDOW_MS);

  const [totalStudents, activeStudents, resources] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'STUDENT', isActive: true } }),
    prisma.resource.findMany({
      orderBy: { lastDate: 'asc' },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        lastDate: true,
        isPublished: true,
        questionText: true,
        questionFileUrl: true,
        answerText: true,
        answerFileUrl: true,
      },
    }),
  ]);

  // Students only ever see published material.
  const visible = user.role === 'STUDENT' ? resources.filter((r) => r.isPublished) : resources;

  const upcoming = visible
    .filter((r) => r.lastDate.getTime() > now.getTime() && r.lastDate.getTime() <= soon.getTime())
    .map((r) => brief(r, now));

  const past = visible
    .filter((r) => r.lastDate.getTime() <= now.getTime())
    .map((r) => brief(r, now))
    .reverse()
    .slice(0, 5);

  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

  if (user.role === 'ADMIN') {
    const [published, drafts] = await Promise.all([
      prisma.resource.count({ where: { isPublished: true } }),
      prisma.resource.count({ where: { isPublished: false } }),
    ]);

    return sendSuccess(res, {
      role: 'ADMIN',
      stats: {
        totalStudents,
        activeStudents,
        inactiveStudents: totalStudents - activeStudents,
        totalResources: resources.length,
        publishedResources: published,
        draftResources: drafts,
        quizzes: resources.filter((r) => r.type === 'QUIZ').length,
        assignments: resources.filter((r) => r.type === 'ASSIGNMENT').length,
        activeNow: visible.filter((r) => r.lastDate.getTime() > now.getTime()).length,
        upcomingLastDates: upcoming.length,
        pastLastDate: visible.filter((r) => r.lastDate.getTime() <= now.getTime()).length,
        unreadNotifications: unread,
      },
      upcoming,
      recent: past,
      all: visible.map((r) => brief(r, now)),
    });
  }

  return sendSuccess(res, {
    role: 'STUDENT',
    stats: {
      totalResources: visible.length,
      quizzes: visible.filter((r) => r.type === 'QUIZ').length,
      assignments: visible.filter((r) => r.type === 'ASSIGNMENT').length,
      activeNow: visible.filter((r) => r.lastDate.getTime() > now.getTime()).length,
      upcomingLastDates: upcoming.length,
      pastLastDate: visible.filter((r) => r.lastDate.getTime() <= now.getTime()).length,
      unreadNotifications: unread,
    },
    upcoming,
    recent: past,
    all: visible.map((r) => brief(r, now)),
  });
}

/**
 * POST /api/admin/reminders/run
 * Triggers the sweep on demand. The sweep is idempotent, so pressing this
 * repeatedly is harmless - it is the same code path the cron job uses.
 */
export async function runReminderSweepNow(_req: Request, res: Response) {
  const summary = await runReminderSweep();

  return sendSuccess(
    res,
    {
      ranAt: summary.ranAt,
      windowFrom: summary.windowFrom,
      windowTo: summary.windowTo,
      resourcesConsidered: summary.resourcesConsidered,
      remindersCreated: summary.remindersCreated,
      emailsSent: summary.emailsSent,
      duplicatesPrevented: summary.duplicatesPrevented,
      errors: summary.errors,
    },
    200,
    summary.remindersCreated > 0
      ? `${summary.remindersCreated} reminder${summary.remindersCreated === 1 ? '' : 's'} sent`
      : 'No new reminders were due',
  );
}

/**
 * GET /api/admin/reminders
 * Operational view of the reminder pipeline (and handy for verification).
 */
export async function listReminders(req: Request, res: Response) {
  const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 50), 200);
  const reminders = await getReminderHistory(limit);

  return sendSuccess(
    res,
    reminders.map((r) => ({
      id: r.id,
      kind: r.kind,
      targetId: r.targetId,
      user: r.user,
      reminderFor: r.reminderFor,
      reminderForFormatted: formatDeadline(r.reminderFor),
      channel: r.channel,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
    })),
  );
}
