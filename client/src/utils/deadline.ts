import type { DeadlinePhase } from '@/types';

/**
 * Client-side mirror of the server's deadline presentation rules.
 *
 * The server is authoritative for *what is published*; this file only decides
 * how a last date should *look*. Thresholds match
 * `server/src/utils/deadline.ts`.
 */

export const APPROACHING_HOURS = 48;
export const CRITICAL_HOURS = 6;

export interface DeadlineVisual {
  label: string;
  className: string;
  dot: string;
}

const STYLES: Record<DeadlinePhase, DeadlineVisual> = {
  OPEN: { label: 'Open', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20', dot: 'bg-emerald-500' },
  APPROACHING: { label: 'Due soon', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20', dot: 'bg-amber-500' },
  CRITICAL: { label: 'Due very soon', className: 'bg-red-50 text-red-700 ring-1 ring-red-600/20', dot: 'bg-red-500' },
  EXPIRED: { label: 'Last date passed', className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-400/20', dot: 'bg-slate-400' },
  UPCOMING: { label: 'Not open yet', className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20', dot: 'bg-violet-500' },
  SUBMITTED: { label: 'Submitted', className: 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/20', dot: 'bg-brand-500' },
};

export function deadlineVisual(phase: DeadlinePhase): DeadlineVisual {
  return STYLES[phase] ?? STYLES.OPEN;
}

/**
 * Human phrasing for the remaining time, as used across the UI:
 * "Due in 2 days", "Due tomorrow", "Due in 4 hours", "Expired".
 */
export function humanCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  if (days >= 2) return `Due in ${days} days`;
  if (days === 1) return 'Due tomorrow';
  if (hours >= 1) return hours >= 20 ? 'Due today' : `Due in ${hours} hour${hours === 1 ? '' : 's'}`;
  if (minutes >= 1) return `Due in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  return 'Due now';
}

/** Tight ticking format for the live countdown chip: "2d 4h", "18m 04s". */
export function tickingCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** Recomputes a phase locally so badges react to the clock without refetching. */
export function derivePhase(
  lastDate: string,
  opts: { startAt?: string | null; submitted?: boolean } = {},
): DeadlinePhase {
  const now = Date.now();
  const ms = new Date(lastDate).getTime() - now;

  if (opts.submitted) return 'SUBMITTED';
  if (ms < 0) return 'EXPIRED';
  if (opts.startAt && new Date(opts.startAt).getTime() > now) return 'UPCOMING';

  const hours = ms / 3_600_000;
  if (hours <= CRITICAL_HOURS) return 'CRITICAL';
  if (hours <= APPROACHING_HOURS) return 'APPROACHING';
  return 'OPEN';
}
