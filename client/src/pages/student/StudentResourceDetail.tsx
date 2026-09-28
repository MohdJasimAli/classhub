import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Download,
  FileText,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { useResource } from '@/hooks/useApi';
import { DeadlineBadge, CountdownChip } from '@/components/DeadlineBadge';
import { Card, CardHeader, StatusPill } from '@/components/ui';
import { ErrorState, LoadingState } from '@/components/States';
import { fileUrl } from '@/services/api';
import { formatBytes } from '@/utils';
import type { Resource } from '@/types';

/**
 * The student's reading view. A single page holding the question above the
 * answer, so self-assessment is a scroll rather than a navigation.
 */
export function StudentResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: resource, isLoading, isError, error, refetch } = useResource(id);

  if (isLoading) return <LoadingState label="Loading…" />;
  if (isError || !resource) {
    return (
      <ErrorState
        title="Not available"
        message={error?.message ?? 'This material does not exist or is not published.'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate('/student/resources')} className="btn-ghost btn-sm -ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to material
      </button>

      {/* ------------------------------- Header ------------------------------- */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={resource.type === 'QUIZ' ? 'violet' : 'brand'}>
                  {resource.type === 'QUIZ' ? 'Quiz' : 'Assignment'}
                </StatusPill>
                <StatusPill tone={resource.past ? 'gray' : 'green'}>
                  {resource.past ? 'Last date passed' : 'Open'}
                </StatusPill>
              </div>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {resource.title}
              </h1>
              {resource.description && (
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
                  {resource.description}
                </p>
              )}
            </div>

            <div className="w-full shrink-0 rounded-lg bg-slate-50 p-4 sm:w-56">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                Last date
              </p>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">
                {resource.lastDateFormatted}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <DeadlineBadge phase={resource.phase} deadline={resource.lastDate} />
                <CountdownChip deadline={resource.lastDate} variant="inline" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <QuestionPanel resource={resource} />
        <AnswerPanel resource={resource} />
      </div>

      <div className="flex justify-center">
        <Link to="/student/resources" className="btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to material
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuestionPanel({ resource }: { resource: Resource }) {
  const empty = !resource.questionText && !resource.questionFile;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Question"
        subtitle="What you need to work through"
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <HelpCircle className="h-4 w-4" aria-hidden />
          </span>
        }
      />
      <div className="flex-1 space-y-4 p-5">
        {empty ? (
          <p className="text-sm text-slate-500">No question was attached to this item.</p>
        ) : (
          <>
            {resource.questionText && (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {resource.questionText}
              </div>
            )}
            {resource.questionFile && <FileDownload file={resource.questionFile} />}
          </>
        )}
      </div>
    </Card>
  );
}

function AnswerPanel({ resource }: { resource: Resource }) {
  const empty = !resource.answerText && !resource.answerFile;

  return (
    <Card className="flex flex-col border-emerald-200">
      <CardHeader
        title="Answer"
        subtitle="Model answers for self-assessment"
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
        }
      />
      <div className="flex-1 space-y-4 p-5">
        {empty ? (
          <p className="text-sm text-slate-500">No answer has been attached to this item yet.</p>
        ) : (
          <>
            {resource.answerText && (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {resource.answerText}
              </div>
            )}
            {resource.answerFile && <FileDownload file={resource.answerFile} />}
          </>
        )}
      </div>
    </Card>
  );
}

function FileDownload({ file }: { file: NonNullable<Resource['questionFile']> }) {
  return (
    <a
      href={fileUrl(file.url)}
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
          {file.size ? <p className="text-xs text-slate-500">{formatBytes(file.size)}</p> : null}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700">
        <Download className="h-4 w-4" aria-hidden />
        Download
      </span>
    </a>
  );
}
