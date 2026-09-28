import { Prisma, type ResourceType } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { emailService } from './email/service.js';
import { notificationService } from './notification.service.js';
import { formatDeadline, formatRemaining, reminderWindow } from '../utils/deadline.js';

/**
 * ---------------------------------------------------------------------------
 * Deadline reminder engine
 *
 * RELIABILITY MODEL
 * -----------------
 * Reminders are not pre-registered as timers. Instead a periodic sweep asks a
 * single question of the database:
 *
 *     "Which published resources have a last date between (now + lead -
 *      tolerance) and (now + lead + tolerance), and which students have no
 *      reminder row yet?"
 *
 * That design gives us the properties the brief asks for:
 *
 *   * Duplicate prevention - a `DeadlineReminder` row is created per
 *     (kind, target, student, lastDate) behind a UNIQUE constraint. A second
 *     attempt, an overlapping sweep, or a retried request loses the race at the
 *     database level, not in application code.
 *
 *   * Restart safety - the schedule is not held in memory. After a crash or
 *     redeploy the very next sweep re-derives everything from persisted state,
 *     so pending reminders are simply picked back up. A sweep also runs once at
 *     boot, so anything that came due while the process was down is caught.
 *
 *   * Edit handling - the last date itself is part of the unique key. If an
 *     admin moves it, the new instant is a distinct key and a fresh reminder
 *     becomes eligible, while the previous reminder is not resent.
 * ---------------------------------------------------------------------------
 */

export interface SweepSummary {
  ranAt: Date;
  windowFrom: Date;
  windowTo: Date;
  resourcesConsidered: number;
  remindersCreated: number;
  emailsSent: number;
  duplicatesPrevented: number;
  notificationsCreated: number;
  errors: Array<{ kind: 'QUIZ' | 'ASSIGNMENT'; targetId: string; userId: string; message: string }>;
}

interface Candidate {
  kind: 'QUIZ' | 'ASSIGNMENT';
  type: ResourceType;
  targetId: string;
  title: string;
  lastDate: Date;
}

/**
 * Attempts to reserve a reminder slot. Returns true only for the process that
 * wins the unique constraint - this is the duplicate-prevention barrier.
 */
async function reserveReminder(candidate: Candidate, userId: string): Promise<boolean> {
  try {
    await prisma.deadlineReminder.create({
      data: {
        kind: candidate.kind,
        targetId: candidate.targetId,
        reminderFor: candidate.lastDate,
        userId,
        channel: 'EMAIL',
        // Reserve first, then send. `sentAt` is refreshed on success.
        sentAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false; // Already handled in a previous sweep. Skip silently.
    }
    throw error;
  }
}

async function dispatchReminder(
  candidate: Candidate,
  student: { id: string; name: string; email: string },
): Promise<void> {
  const now = new Date();
  const remaining = formatRemaining(candidate.lastDate.getTime() - now.getTime());
  const lastDateFormatted = formatDeadline(candidate.lastDate);
  const kindLabel = candidate.kind === 'QUIZ' ? 'Quiz' : 'Assignment';
  const linkPath = `/student/resources/${candidate.targetId}`;
  const linkUrl = `${env.CLIENT_URL}${linkPath}`;

  // 1) In-app notification (always recorded, cheap, never fails the job).
  await notificationService
    .create({
      userId: student.id,
      type: 'DEADLINE_REMINDER',
      title: `${kindLabel} last date approaching: ${candidate.title}`,
      message: `Last date is ${lastDateFormatted} (${remaining} remaining). The question and answer are available now.`,
      link: linkPath,
      resourceId: candidate.targetId,
    })
    .catch(() => undefined);

  // 2) Email reminder.
  const result = await emailService.sendDeadlineReminder({
    to: student.email,
    userId: student.id,
    studentName: student.name,
    kindLabel,
    title: candidate.title,
    lastDateFormatted,
    remainingFormatted: remaining,
    linkUrl,
  });

  if (result.ok) {
    await prisma.deadlineReminder.updateMany({
      where: {
        kind: candidate.kind,
        targetId: candidate.targetId,
        userId: student.id,
        reminderFor: candidate.lastDate,
      },
      data: { sentAt: new Date(), error: null },
    });
  } else {
    // Release the reservation so a later sweep can retry the delivery.
    await prisma.deadlineReminder
      .deleteMany({
        where: {
          kind: candidate.kind,
          targetId: candidate.targetId,
          userId: student.id,
          reminderFor: candidate.lastDate,
        },
      })
      .catch(() => undefined);
  }
}

async function processCandidate(candidate: Candidate, summary: SweepSummary): Promise<void> {
  // Active students only.
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', isActive: true },
    select: { id: true, name: true, email: true },
  });
  if (students.length === 0) return;

  for (const student of students) {
    try {
      const reserved = await reserveReminder(candidate, student.id);
      if (!reserved) {
        summary.duplicatesPrevented += 1;
        continue;
      }
      summary.remindersCreated += 1;
      summary.notificationsCreated += 1;

      await dispatchReminder(candidate, student);
      summary.emailsSent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      summary.errors.push({
        kind: candidate.kind,
        targetId: candidate.targetId,
        userId: student.id,
        message,
      });
       
      console.error(
        `[reminders] failed for ${candidate.kind} ${candidate.targetId} / student ${student.id}: ${message}`,
      );
    }
  }
}

/** Executes one sweep. Safe to call at any time, from any number of processes. */
export async function runReminderSweep(now: Date = new Date()): Promise<SweepSummary> {
  const { from, to } = reminderWindow(now);

  const summary: SweepSummary = {
    ranAt: now,
    windowFrom: from,
    windowTo: to,
    resourcesConsidered: 0,
    remindersCreated: 0,
    emailsSent: 0,
    duplicatesPrevented: 0,
    notificationsCreated: 0,
    errors: [],
  };

  const resources = await prisma.resource.findMany({
    where: { isPublished: true, lastDate: { gte: from, lte: to } },
    select: { id: true, type: true, title: true, lastDate: true },
  });

  const candidates: Candidate[] = resources.map((resource) => ({
    kind: resource.type === 'QUIZ' ? 'QUIZ' : 'ASSIGNMENT',
    type: resource.type,
    targetId: resource.id,
    title: resource.title,
    lastDate: resource.lastDate,
  }));

  summary.resourcesConsidered = candidates.length;
  for (const candidate of candidates) {
    await processCandidate(candidate, summary);
  }

  return summary;
}

/** Housekeeping: drop reservation rows for last dates that are long past. */
export async function pruneStaleReminders(before: Date): Promise<number> {
  const result = await prisma.deadlineReminder.deleteMany({
    where: { reminderFor: { lt: before } },
  });
  return result.count;
}

/** Operational view of the reminder pipeline. */
export async function getReminderHistory(limit = 100) {
  return prisma.deadlineReminder.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}
