import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, initials } from '@/utils';
import type { DeadlinePhase } from '@/types';
import { DeadlineBadge, CountdownChip } from './DeadlineBadge';

// ---------------------------------------------------------------------------
// Presentational building blocks shared by both dashboards.
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  as: _as,
}: {
  children: ReactNode;
  className?: string;
  as?: string;
}) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'red' | 'slate' | 'violet';
  to?: string;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-600',
  }[tone];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones)}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </>
  );

  const base = 'card card-hover p-4 block';
  return to ? (
    <Link to={to} className={base}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** Horizontal progress bar with an accessible value. */
export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  label,
  showPercent = true,
  className,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'emerald' | 'amber' | 'red';
  label?: string;
  showPercent?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tones = {
    brand: 'bg-brand-600',
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
    red: 'bg-red-600',
  }[tone];

  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="font-medium text-slate-600">{label}</span>}
          {showPercent && <span className="font-semibold text-slate-700 tabular-nums">{pct}%</span>}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className={cn('h-full rounded-full transition-all duration-500', tones)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700',
        sizes,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: 'gray' | 'green' | 'amber' | 'red' | 'brand' | 'violet';
  children: ReactNode;
}) {
  const tones = {
    gray: 'bg-slate-100 text-slate-600 ring-1 ring-slate-500/10',
    green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
    brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/20',
    violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20',
  }[tone];
  return <span className={cn('badge', tones)}>{children}</span>;
}

/** Last-date row used on both dashboards' "upcoming" lists. */
export function DeadlineRow({
  type,
  title,
  lastDate,
  formatted,
  phase,
  to,
  meta,
}: {
  type: 'QUIZ' | 'ASSIGNMENT';
  title: string;
  lastDate: string;
  formatted: string;
  phase: DeadlinePhase;
  to: string;
  meta?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'badge',
              type === 'QUIZ'
                ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-600/20'
                : 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/20',
            )}
          >
            {type === 'QUIZ' ? 'Quiz' : 'Assignment'}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">
          {formatted}
          {meta ? ` · ${meta}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <DeadlineBadge phase={phase} deadline={lastDate} />
        <CountdownChip deadline={lastDate} variant="inline" className="mt-1" />
      </div>
    </Link>
  );
}
