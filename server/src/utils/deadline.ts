import { env } from '../config/env.js';

/**
 * ---------------------------------------------------------------------------
 * Deadline logic - the single source of truth for every time-based rule in
 * ClassHub. Controllers, the reminder job and the reporting endpoints all
 * defer to these helpers so that the client can never disagree with the
 * server about whether something is still submittable.
 * ---------------------------------------------------------------------------
 */

export type DeadlinePhase =
  | 'UPCOMING' // not open yet
  | 'OPEN' // comfortably before the last date
  | 'APPROACHING' // open, but under the "hurry up" threshold
  | 'CRITICAL' // open, but very close
  | 'EXPIRED'; // the last date has passed

/** Under this many hours remaining we show the yellow "approaching" state. */
export const APPROACHING_HOURS = 48;
/** Under this many hours remaining we show the red "due soon" state. */
export const CRITICAL_HOURS = 6;

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR;
}

export function isPast(deadline: Date, now: Date = new Date()): boolean {
  return now.getTime() > deadline.getTime();
}

export function isBefore(date: Date, now: Date = new Date()): boolean {
  return now.getTime() < date.getTime();
}

/**
 * Coarse status behind the coloured last-date badges. The thresholds are the
 * single definition of the colour language; the client mirrors them exactly.
 */
export function deadlinePhase(input: { deadline: Date; now?: Date }): DeadlinePhase {
  const now = input.now ?? new Date();
  const msRemaining = input.deadline.getTime() - now.getTime();

  if (msRemaining < 0) return 'EXPIRED';

  const hours = msRemaining / MS_PER_HOUR;
  if (hours <= CRITICAL_HOURS) return 'CRITICAL';
  if (hours <= APPROACHING_HOURS) return 'APPROACHING';
  return 'OPEN';
}

// ---------------------------------------------------------------------------
// Human readable formatting (used by emails and by notification bodies).
// ---------------------------------------------------------------------------

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** e.g. "25 September 2026, 11:59 PM" - stable, locale-independent output. */
export function formatDeadline(date: Date): string {
  const hours24 = date.getHours();
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours12}:${mm} ${suffix}`;
}

/** e.g. "2 days", "4 hours", "15 minutes", "under a minute". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'no time remaining';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);

  if (days > 0) {
    const rest = hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : '';
    return rest ? `${days} day${days === 1 ? '' : 's'} and ${rest}` : `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return 'under a minute';
}

/** Compact countdown for compact UI surfaces, e.g. "2d 4h", "18m". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Reminder scheduling window.
// ---------------------------------------------------------------------------

/**
 * Reminder windows are computed as a catch-up sweep rather than as a
 * pre-registered timer:
 *
 *   "send a reminder for every item that is still open, whose last date falls
 *    within the next `lead` hours, and for which this student has no reminder
 *    row yet"
 *
 * Because the sweep is driven by a database query and guarded by a unique
 * constraint, it is:
 *   - idempotent  (repeat runs never duplicate)
 *   - restart-safe (a crashed server resumes exactly where it left off)
 *   - drift-safe   (a missed sweep is picked up by the next one for as long
 *                   as the item is still open)
 *
 * The window deliberately starts at `now` rather than at a narrow band
 * centred on the lead time. An earlier version used
 * `[now + lead - tol, now + lead + tol]`, which meant an item whose window was
 * missed fell through the cracks and was never reminded at all.
 *
 * That matters on platforms where the process is not guaranteed to be running
 * (a free hosting tier that idles to sleep, for example): the service can wake
 * up hours after the nominal reminder moment. With the window anchored at
 * `now`, the first sweep after waking sends everything still outstanding.
 * Because `sentAt`/the unique key make it idempotent, a student can never
 * receive the same reminder twice, so widening the window costs nothing.
 *
 * The email body states the real time remaining ("in about 3 hours"), so a
 * reminder that fires late is still accurate rather than claiming 24 hours.
 */
export function reminderWindow(now: Date = new Date()): { from: Date; to: Date } {
  const leadMs = env.REMINDER_LEAD_HOURS * MS_PER_HOUR;
  const toleranceMs = env.REMINDER_TOLERANCE_MINUTES * MS_PER_MINUTE;
  return {
    // Anything still open is eligible; `gte: from` with from = now means the
    // sweep also picks up an item whose last date is this very instant.
    from: now,
    to: new Date(now.getTime() + (leadMs + toleranceMs)),
  };
}
