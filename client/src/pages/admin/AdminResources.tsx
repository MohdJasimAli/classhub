import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Download,
  Eye,
  EyeOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation } from '@tanstack/react-query';
import { resourceApi, ApiError } from '@/services/api';
import { useInvalidateResources, useResources } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useCountdown';
import { DeadlineBadge } from '@/components/DeadlineBadge';
import { Card, StatusPill } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { EmptyState, ErrorState, SkeletonTable } from '@/components/States';
import { cn } from '@/utils';
import type { Resource } from '@/types';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'QUIZ', label: 'Quizzes' },
  { value: 'ASSIGNMENT', label: 'Assignments' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
  { value: 'upcoming', label: 'Open' },
  { value: 'past', label: 'Closed' },
];

export function AdminResourceListPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateResources();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Resource | null>(null);
  const debounced = useDebounced(search);

  const type = params.get('type') ?? 'all';
  const status = params.get('status') ?? 'all';

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

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      resourceApi.setPublished(id, isPublished),
    onSuccess: (resource) => {
      toast.success(resource.isPublished ? 'Published - students can see it now' : 'Unpublished');
      invalidate();
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => resourceApi.remove(id),
    onSuccess: () => {
      toast.success('Resource deleted');
      setPendingDelete(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
      setPendingDelete(null);
    },
  });

  const resources = data?.items ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Material</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {resources.length} item{resources.length === 1 ? '' : 's'} · question, answer and last date
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => navigate('/admin/resources/new')}>
          <Plus className="h-4 w-4" aria-hidden /> New resource
        </button>
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
        <div className="flex gap-1 overflow-x-auto">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setFilter('type', filter.value)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                type === filter.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setFilter('status', filter.value)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                status === filter.value ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && <SkeletonTable rows={5} cols={5} />}
      {isError && <ErrorState message={error?.message} onRetry={() => void refetch()} />}

      {!isLoading && !isError && resources.length === 0 && (
        <Card>
          <EmptyState
            title="No material yet"
            description="Upload a question and its answer, set a last date, and publish."
            icon={<BookOpen className="h-6 w-6" aria-hidden />}
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/admin/resources/new')}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> New resource
              </button>
            }
          />
        </Card>
      )}

      {resources.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                {/* Secondary columns collapse on phones: six columns do not
                    fit a 360px screen without horizontal scrolling. */}
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Type</th>
                  <th className="table-header hidden lg:table-cell">Contents</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Last date</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resources.map((resource) => (
                  <tr key={resource.id} className="transition-colors hover:bg-slate-50">
                    <td className="table-cell">
                      <Link to={`/admin/resources/${resource.id}`} className="font-medium text-brand-700 hover:underline">
                        {resource.title}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <StatusPill tone={resource.type === 'QUIZ' ? 'violet' : 'brand'}>
                        {resource.type === 'QUIZ' ? 'Quiz' : 'Assignment'}
                      </StatusPill>
                    </td>
                    <td className="table-cell hidden lg:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {resource.questionText && (
                          <span className="badge bg-slate-100 text-slate-600">Q text</span>
                        )}
                        {resource.questionFile && (
                          <span className="badge bg-slate-100 text-slate-600">
                            <Download className="h-3 w-3" aria-hidden /> Q file
                          </span>
                        )}
                        {resource.answerText && (
                          <span className="badge bg-emerald-50 text-emerald-700">A text</span>
                        )}
                        {resource.answerFile && (
                          <span className="badge bg-emerald-50 text-emerald-700">
                            <Download className="h-3 w-3" aria-hidden /> A file
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill tone={resource.isPublished ? 'green' : 'gray'}>
                          {resource.isPublished ? 'Published' : 'Draft'}
                        </StatusPill>
                        <DeadlineBadge phase={resource.phase} deadline={resource.lastDate} />
                      </div>
                    </td>
                    <td className="table-cell hidden text-slate-500 sm:table-cell">
                      {resource.lastDateFormatted}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/admin/resources/${resource.id}`} className="btn-ghost btn-sm">
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          title={resource.isPublished ? 'Unpublish' : 'Publish'}
                          onClick={() =>
                            togglePublish.mutate({ id: resource.id, isPublished: !resource.isPublished })
                          }
                        >
                          {resource.isPublished ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                          title="Delete"
                          onClick={() => setPendingDelete(resource)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        title="Delete this resource?"
        confirmLabel="Delete"
        isPending={remove.isPending}
        message={`"${pendingDelete?.title}" and any attached files will be permanently deleted. This cannot be undone.`}
      />
    </div>
  );
}
