import { cn } from '@/utils';
import { deadlineVisual, humanCountdown, tickingCountdown } from '@/utils/deadline';
import { useCountdown } from '@/hooks/useCountdown';
import type { DeadlinePhase } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Deadline badges
 *
 * Colour language, as specified:
 *   green  = plenty of time      (OPEN)
 *   amber  = approaching          (APPROACHING)
 *   red    = deadline soon        (CRITICAL)
 *   grey   = expired              (EXPIRED / CLOSED)
 *   blue   = submitted            (SUBMITTED)
 * ---------------------------------------------------------------------------
 */

export function DeadlineBadge({
  phase,
  deadline,
  className,
  showIcon = true,
}: {
  phase: DeadlinePhase;
  deadline?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const visual = deadlineVisual(phase);
  const remaining = useCountdown(deadline ?? null);
  const isUrgent = phase === 'CRITICAL' || phase === 'APPROACHING';

  return (
    <span
      className={cn('badge', visual.className, isUrgent && 'font-semibold', className)}
      title={deadline ? `Deadline: ${new Date(deadline).toLocaleString()}` : undefined}
    >
      {showIcon && <span className={cn('h-1.5 w-1.5 rounded-full', visual.dot)} aria-hidden />}
      {phase === 'SUBMITTED' || !deadline ? visual.label : humanCountdown(remaining)}
    </span>
  );
}

/** Live ticking chip, e.g. "2d 4h" -> "3h 12m" -> "18m 04s". */
export function CountdownChip({
  deadline,
  className,
  variant = 'default',
}: {
  deadline: string;
  className?: string;
  variant?: 'default' | 'inline';
}) {
  const remaining = useCountdown(deadline);
  const expired = remaining <= 0;
  const urgent = remaining > 0 && remaining <= 6 * 3_600_000;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums',
        expired && 'bg-slate-100 text-slate-500',
        !expired && urgent && 'bg-red-50 text-red-700',
        !expired && !urgent && 'bg-slate-100 text-slate-700',
        variant === 'inline' && 'bg-transparent px-0',
        className,
      )}
      aria-live="off"
    >
      {tickingCountdown(remaining)}
    </span>
  );
}

/** Static "Due 25 Sept 2026, 11:59 PM" line, for detail views. */
export function DeadlineDetail({ deadline, formatted }: { deadline: string; formatted?: string }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-slate-800">
        {formatted ?? new Date(deadline).toLocaleString()}
      </p>
      <CountdownChip deadline={deadline} variant="inline" className="mt-0.5" />
    </div>
  );
}
