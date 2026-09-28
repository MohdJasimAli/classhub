import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Download,
  FileText,
  HelpCircle,
  Paperclip,
  Save,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation } from '@tanstack/react-query';
import { resourceApi, ApiError, fileUrl } from '@/services/api';
import { useInvalidateResources, useResource } from '@/hooks/useApi';
import { Card, CardHeader, StatusPill } from '@/components/ui';
import { ErrorBanner, ErrorState, LoadingState } from '@/components/States';
import { fromDateTimeLocal, toDateTimeLocal } from '@/utils';
import { cn, formatBytes } from '@/utils';
import type { Resource, ResourceType } from '@/types';

const ACCEPTED = '.pdf,.doc,.docx,.ppt,.pptx,.zip,.jpg,.jpeg,.png';
const MAX_MB = 10;

interface FormState {
  type: ResourceType;
  title: string;
  description: string;
  questionText: string;
  answerText: string;
  lastDate: string;
  isPublished: boolean;
}

const blank = (): FormState => ({
  type: 'QUIZ',
  title: '',
  description: '',
  questionText: '',
  answerText: '',
  // Default to one week out so the form is valid immediately.
  lastDate: toDateTimeLocal(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  isPublished: false,
});

const fromResource = (resource: Resource): FormState => ({
  type: resource.type,
  title: resource.title,
  description: resource.description ?? '',
  questionText: resource.questionText ?? '',
  answerText: resource.answerText ?? '',
  lastDate: toDateTimeLocal(new Date(resource.lastDate)),
  isPublished: resource.isPublished,
});

/**
 * Create / edit form. The caller keys this component on the resource id, so
 * editing an existing item mounts fresh with its values already in place and no
 * synchronising effect is needed.
 */
function ResourceForm({ resource, isNew }: { resource?: Resource; isNew: boolean }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateResources();

  const [form, setForm] = useState<FormState>(() => (resource ? fromResource(resource) : blank()));
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragField, setDragField] = useState<'questionFile' | 'answerFile' | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const data = new FormData();
      data.append('type', form.type);
      data.append('title', form.title.trim());
      if (form.description.trim()) data.append('description', form.description.trim());
      data.append('lastDate', fromDateTimeLocal(form.lastDate));
      data.append('isPublished', String(form.isPublished));
      if (form.questionText.trim()) data.append('questionText', form.questionText.trim());
      if (form.answerText.trim()) data.append('answerText', form.answerText.trim());
      if (questionFile) data.append('questionFile', questionFile);
      if (answerFile) data.append('answerFile', answerFile);

      return isNew ? resourceApi.create(data) : resourceApi.update(resource!.id, data);
    },
    onSuccess: (saved) => {
      toast.success(isNew ? 'Resource created' : 'Resource updated');
      invalidate();
      navigate(`/admin/resources/${saved.id}`);
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? (e.fieldErrors[0] ?? e.message) : 'Unable to save.');
    },
  });

  const pickFile = (field: 'questionFile' | 'answerFile', candidate: File | undefined) => {
    if (!candidate) return;
    setError(null);
    const ext = `.${candidate.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!ACCEPTED.split(',').includes(ext)) {
      setError(`"${ext}" files are not accepted. Allowed: ${ACCEPTED}`);
      return;
    }
    if (candidate.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${formatBytes(candidate.size)}. The maximum is ${MAX_MB} MB.`);
      return;
    }
    if (field === 'questionFile') setQuestionFile(candidate);
    else setAnswerFile(candidate);
  };

  const clearFile = (field: 'questionFile' | 'answerFile') => {
    if (field === 'questionFile') {
      setQuestionFile(null);
      if (questionRef.current) questionRef.current.value = '';
    } else {
      setAnswerFile(null);
      if (answerRef.current) answerRef.current.value = '';
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.title.trim().length < 3) return setError('The title must be at least 3 characters.');
    if (!form.lastDate) return setError('Please set a last date.');
    if (new Date(form.lastDate) <= new Date()) return setError('The last date must be in the future.');

    const hasQuestion = form.questionText.trim() || questionFile || resource?.questionFile;
    const hasAnswer = form.answerText.trim() || answerFile || resource?.answerFile;
    if (!hasQuestion) return setError('Add the question as text, attach a file, or both.');
    if (!hasAnswer) return setError('Add the answer as text, attach a file, or both.');

    save.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <ErrorBanner message={error} />}

      {/* ------------------------------ Basics ------------------------------ */}
      <Card>
        <CardHeader
          title="Details"
          subtitle="What students will see in the list"
          action={
            <StatusPill tone={form.isPublished ? 'green' : 'gray'}>
              {form.isPublished ? 'Published' : 'Draft'}
            </StatusPill>
          }
        />
        <div className="space-y-4 p-5">
          <fieldset>
            <legend className="label">Type</legend>
            <div className="flex gap-2">
              {(
                [
                  { value: 'QUIZ', label: 'Quiz', icon: <HelpCircle className="h-4 w-4" aria-hidden /> },
                  { value: 'ASSIGNMENT', label: 'Assignment', icon: <FileText className="h-4 w-4" aria-hidden /> },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    form.type === option.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={option.value}
                    checked={form.type === option.value}
                    onChange={() => set('type', option.value)}
                    className="sr-only"
                  />
                  {option.icon}
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="r-title" className="label">Title</label>
            <input
              id="r-title"
              className="input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              required
              placeholder="e.g. Database Management - Mid-Term Quiz"
            />
          </div>

          <div>
            <label htmlFor="r-desc" className="label">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="r-desc"
              rows={2}
              className="input resize-y"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="A one-line summary to help students decide what to open."
            />
          </div>

          <div>
            <label htmlFor="r-lastdate" className="label">
              Last date
            </label>
            <input
              id="r-lastdate"
              type="datetime-local"
              className="input"
              value={form.lastDate}
              onChange={(e) => set('lastDate', e.target.value)}
              required
            />
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Students are emailed 24 hours before this moment.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3.5">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => set('isPublished', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Publish immediately</span>
              <span className="block text-xs text-slate-500">
                Students can see and read this as soon as it is saved.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------------------- Question ---------------------------- */}
        <Card>
          <CardHeader
            title="Question"
            subtitle="Type it, attach a file, or both"
            icon={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <HelpCircle className="h-4 w-4" aria-hidden />
              </span>
            }
          />
          <div className="space-y-4 p-5">
            <div>
              <label htmlFor="r-qtext" className="label">
                Question text
              </label>
              <textarea
                id="r-qtext"
                rows={8}
                className="input resize-y font-mono text-sm"
                value={form.questionText}
                onChange={(e) => set('questionText', e.target.value)}
                placeholder={'1. What is the capital of France?\n\n2. Explain normalisation up to 3NF.'}
              />
            </div>

            <FileField
              id="r-qfile"
              label="Question file"
              value={questionFile}
              existingName={resource?.questionFile?.name}
              existingUrl={resource?.questionFile ? fileUrl(resource.questionFile.url) : undefined}
              existingSize={resource?.questionFile?.size}
              inputRef={questionRef}
              isDragging={dragField === 'questionFile'}
              onDragChange={(on) => setDragField(on ? 'questionFile' : null)}
              onPick={(f) => pickFile('questionFile', f)}
              onClear={() => clearFile('questionFile')}
            />
          </div>
        </Card>

        {/* ----------------------------- Answer ----------------------------- */}
        <Card className="border-emerald-200">
          <CardHeader
            title="Answer"
            subtitle="Model answers for self-assessment"
            icon={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
            }
          />
          <div className="space-y-4 p-5">
            <div>
              <label htmlFor="r-atext" className="label">
                Answer text
              </label>
              <textarea
                id="r-atext"
                rows={8}
                className="input resize-y font-mono text-sm"
                value={form.answerText}
                onChange={(e) => set('answerText', e.target.value)}
                placeholder={'1. C - Paris\n\n2. 3NF removes transitive dependencies.'}
              />
            </div>

            <FileField
              id="r-afile"
              label="Answer file"
              value={answerFile}
              existingName={resource?.answerFile?.name}
              existingUrl={resource?.answerFile ? fileUrl(resource.answerFile.url) : undefined}
              existingSize={resource?.answerFile?.size}
              inputRef={answerRef}
              isDragging={dragField === 'answerFile'}
              onDragChange={(on) => setDragField(on ? 'answerFile' : null)}
              onPick={(f) => pickFile('answerFile', f)}
              onClear={() => clearFile('answerFile')}
            />
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => navigate('/admin/resources')}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          <Save className="h-4 w-4" aria-hidden />
          {save.isPending ? 'Saving…' : isNew ? 'Create resource' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function FileField({
  id,
  label,
  value,
  existingName,
  existingUrl,
  existingSize,
  inputRef,
  isDragging,
  onDragChange,
  onPick,
  onClear,
}: {
  id: string;
  label: string;
  value: File | null;
  existingName?: string | null;
  existingUrl?: string;
  existingSize?: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  isDragging: boolean;
  onDragChange: (dragging: boolean) => void;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const shown = value ?? null;

  return (
    <div>
      <label className="label">{label}</label>

      {shown ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{shown.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(shown.size)} · ready to upload</p>
            </div>
          </div>
          <button type="button" onClick={onClear} className="btn-ghost btn-sm shrink-0 text-red-600">
            <X className="h-3.5 w-3.5" aria-hidden /> Remove
          </button>
        </div>
      ) : existingName ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{existingName}</p>
              <p className="text-xs text-slate-500">
                {existingSize ? `${formatBytes(existingSize)} · ` : ''}currently attached
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {existingUrl && (
              <a href={existingUrl} className="btn-ghost btn-sm" title="Download current file">
                <Download className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            <label htmlFor={id} className="btn-ghost btn-sm cursor-pointer">
              Replace
              <input
                ref={inputRef}
                id={id}
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            onDragChange(true);
          }}
          onDragLeave={() => onDragChange(false)}
          onDrop={(e) => {
            e.preventDefault();
            onDragChange(false);
            onPick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
            isDragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50',
          )}
        >
          <Upload className="h-6 w-6 text-slate-400" aria-hidden />
          <span className="text-sm font-medium text-slate-700">Drop a file, or click to browse</span>
          <span className="text-xs text-slate-500">
            {ACCEPTED.replace(/,/g, ', ')} · max {MAX_MB} MB
          </span>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AdminResourceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const { data: resource, isLoading, isError, error } = useResource(isNew ? undefined : id);

  if (isNew) {
    return (
      <Shell
        title="New resource"
        subtitle="Upload a question and its answer, then set a last date."
      >
        <ResourceForm isNew />
      </Shell>
    );
  }

  if (isLoading) return <LoadingState label="Loading…" />;
  if (isError || !resource) {
    return <ErrorState title="Not found" message={error?.message} />;
  }

  return (
    <Shell key={resource.id} title="Edit resource" subtitle={resource.title}>
      <ResourceForm resource={resource} isNew={false} />
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <button type="button" onClick={() => navigate('/admin/resources')} className="btn-ghost btn-sm -ml-2">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to material
      </button>
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}
