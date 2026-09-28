import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Download, FileText, HelpCircle, Search, Sparkles } from 'lucide-react';
import { useResources } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useCountdown';
import { DeadlineBadge, CountdownChip } from '@/components/DeadlineBadge';
import { Card, StatusPill } from '@/components/ui';
import { EmptyState, ErrorState, SkeletonTable } from '@/components/States';
import { cn } from '@/utils';
import type { Resource } from '@/types';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'QUIZ', label: 'Quizzes' },
  { value: 'ASSIGNMENT', label: 'Assignments' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'Any date' },
  { value: 'upcoming', label: 'Open' },
  { value: 'past', label: 'Closed' },
];

export function StudentResourceListPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const type = params.get('type') ?? 'all';
  const status = params.get('status') ?? 'all';
  const debounced = useDebounced(search);

  const { data, isLoading, isError, error, refetch } = useResources({
    search: debounced || undefined,
    type,
    status,
    limit: 100,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const resources = data?.items ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Material</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Questions and model answers published by your teacher
        </p>
      </header>

      <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            className="input pl-9"
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search material"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setFilter('type', filter.value)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                type === filter.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setFilter('status', filter.value)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                status === filter.value ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && <SkeletonTable rows={4} cols={4} />}
      {isError && <ErrorState message={error?.message} onRetry={() => void refetch()} />}

      {!isLoading && !isError && resources.length === 0 && (
        <Card>
          <EmptyState
            title="Nothing to show"
            description={
              debounced
                ? `Nothing matches "${debounced}".`
                : 'Your teacher has not published any material yet.'
            }
            icon={<BookOpen className="h-6 w-6" aria-hidden />}
          />
        </Card>
      )}

      {resources.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link to={`/student/resources/${resource.id}`} className="card card-hover flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            resource.type === 'QUIZ'
              ? 'bg-violet-50 text-violet-600'
              : 'bg-brand-50 text-brand-600',
          )}
        >
          {resource.type === 'QUIZ' ? (
            <HelpCircle className="h-5 w-5" aria-hidden />
          ) : (
            <FileText className="h-5 w-5" aria-hidden />
          )}
        </span>
        <DeadlineBadge phase={resource.phase} deadline={resource.lastDate} />
      </div>

      <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">{resource.title}</h2>
      {resource.description && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{resource.description}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {resource.questionText && (
          <StatusPill tone="gray">
            <FileText className="h-3 w-3" aria-hidden /> Question
          </StatusPill>
        )}
        {resource.questionFile && (
          <StatusPill tone="gray">
            <Download className="h-3 w-3" aria-hidden /> Question file
          </StatusPill>
        )}
        {resource.answerText && (
          <StatusPill tone="green">
            <Sparkles className="h-3 w-3" aria-hidden /> Answer
          </StatusPill>
        )}
        {resource.answerFile && (
          <StatusPill tone="green">
            <Download className="h-3 w-3" aria-hidden /> Answer file
          </StatusPill>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-500">Last date {resource.lastDateFormatted}</span>
        <CountdownChip deadline={resource.lastDate} variant="inline" />
      </div>
    </Link>
  );
}
