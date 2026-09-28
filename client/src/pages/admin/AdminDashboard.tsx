import { Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarClock,
  FileText,
  HelpCircle,
  Loader2,
  MailCheck,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { adminApi, notificationApi, ApiError } from '@/services/api';
import { useDashboard, useReminders } from '@/hooks/useApi';
import { Card, CardHeader, DeadlineRow, StatCard, StatusPill } from '@/components/ui';
import { EmptyState, ErrorState, SkeletonCards } from '@/components/States';
import { relativeTime } from '@/utils';

export function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();
  const [showReminders, setShowReminders] = useState(false);
  const { data: reminders, refetch: refetchReminders } = useReminders(10);

  // Manually triggering the sweep is safe: the same idempotent code path the
  // cron job runs, guarded by a unique constraint.
  const sweep = useMutation({
    mutationFn: () => adminApi.runReminderSweep(),
    onSuccess: (result) => {
      toast.success(
        result.remindersCreated > 0
          ? `Sent ${result.remindersCreated} reminder${result.remindersCreated === 1 ? '' : 's'}`
          : `No new reminders due (${result.duplicatesPrevented} already sent)`,
      );
      void refetchReminders();
      void refetch();
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'Sweep failed'),
  });

  /**
   * Sends a diagnostic email to the signed-in admin. The response says whether
   * it was actually delivered or merely captured, which is the difference
   * between "working" and "looks like it is working".
   */
  const testEmail = useMutation({
    mutationFn: () => notificationApi.sendTestEmail(),
    onSuccess: (result) => {
      if (!result.sent) {
        toast.error(result.error ?? 'Delivery failed');
        return;
      }
      if (result.transport.delivered) {
        toast.success(`Test email sent to you via ${result.transport.host}:${result.transport.port}`);
      } else {
        toast.success('Test email captured - SMTP is not configured yet', { icon: '⚠️' });
      }
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : 'Test email failed'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={4} />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data || data.role !== 'ADMIN') {
    return (
      <ErrorState
        title="Could not load the dashboard"
        message={error?.message}
        onRetry={() => void refetch()}
      />
    );
  }

  const { stats, upcoming, all } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Class overview</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Your published material, last dates and reminder activity
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/resources/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden /> New resource
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          value={stats.totalStudents}
          hint={`${stats.activeStudents} active · ${stats.inactiveStudents} inactive`}
          icon={<Users className="h-4 w-4" aria-hidden />}
          to="/admin/students"
        />
        <StatCard
          label="Published material"
          value={stats.publishedResources}
          hint={`${stats.draftResources} draft(s) · ${stats.totalResources} total`}
          icon={<BookOpen className="h-4 w-4" aria-hidden />}
          tone="brand"
          to="/admin/resources"
        />
        <StatCard
          label="Open now"
          value={stats.activeNow}
          hint={`${stats.quizzes} quizzes · ${stats.assignments} assignments`}
          icon={<FileText className="h-4 w-4" aria-hidden />}
          tone="emerald"
        />
        <StatCard
          label="Last dates approaching"
          value={stats.upcomingLastDates}
          hint="Due within 14 days"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          tone="amber"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Last dates approaching"
            subtitle="Due within the next 14 days"
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
            action={
              <Link to="/admin/resources" className="text-xs font-semibold text-brand-700 hover:underline">
                Manage
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              title="No last dates in the next fortnight"
              description="Add a resource with a last date to start tracking."
              icon={<CalendarClock className="h-6 w-6" aria-hidden />}
              action={
                <Link to="/admin/resources/new" className="btn-primary btn-sm">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> New resource
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <DeadlineRow
                    type={item.type}
                    title={item.title}
                    lastDate={item.lastDate}
                    formatted={item.lastDateFormatted}
                    phase={item.phase}
                    to={`/admin/resources/${item.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Deadline reminders"
            subtitle="Sent 24 hours before a last date"
            icon={<Send className="h-4 w-4" aria-hidden />}
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => testEmail.mutate()}
                  disabled={testEmail.isPending}
                  className="btn-secondary btn-sm"
                  title="Send a diagnostic email to yourself"
                >
                  {testEmail.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <MailCheck className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Test email
                </button>
                <button
                  type="button"
                  onClick={() => sweep.mutate()}
                  disabled={sweep.isPending}
                  className="btn-secondary btn-sm"
                  title="Run the sweep now (safe to repeat)"
                >
                  {sweep.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Run sweep
                </button>
                <button
                  type="button"
                  onClick={() => setShowReminders((v) => !v)}
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  {showReminders ? 'Hide log' : 'View log'}
                </button>
              </div>
            }
          />
          {!showReminders ? (
            <EmptyState
              title="The reminder engine is running"
              description="A scheduled job emails every student 24 hours before a last date. Duplicates are prevented by a unique database constraint, and the sweep resumes automatically after a server restart."
              icon={<Send className="h-6 w-6" aria-hidden />}
            />
          ) : (reminders?.length ?? 0) === 0 ? (
            <EmptyState
              title="No reminders sent yet"
              description="Reminders appear here once an item comes within 24 hours of its last date."
              icon={<Send className="h-6 w-6" aria-hidden />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reminders!.map((reminder) => {
                const r = reminder as {
                  id: string;
                  kind: string;
                  sentAt: string | null;
                  user: { name: string; email: string };
                };
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{r.user.name}</p>
                      <p className="truncate text-xs text-slate-500">{r.user.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill tone={r.kind === 'QUIZ' ? 'violet' : 'brand'}>{r.kind}</StatusPill>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {r.sentAt ? relativeTime(r.sentAt) : '—'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="All material"
          subtitle={`${all.length} item${all.length === 1 ? '' : 's'}`}
          icon={<BookOpen className="h-4 w-4" aria-hidden />}
          action={
            <Link to="/admin/resources" className="text-xs font-semibold text-brand-700 hover:underline">
              Manage
            </Link>
          }
        />
        {all.length === 0 ? (
          <EmptyState
            title="Nothing published yet"
            description="Upload a question and its answer to get started."
            icon={<HelpCircle className="h-6 w-6" aria-hidden />}
            action={
              <Link to="/admin/resources/new" className="btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" aria-hidden /> New resource
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                {/* Secondary columns collapse on phones. */}
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Last date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50">
                    <td className="table-cell">
                      <Link to={`/admin/resources/${item.id}`} className="font-medium text-brand-700 hover:underline">
                        {item.title}
                      </Link>
                    </td>
                    <td className="table-cell">
                      <StatusPill tone={item.type === 'QUIZ' ? 'violet' : 'brand'}>
                        {item.type === 'QUIZ' ? 'Quiz' : 'Assignment'}
                      </StatusPill>
                    </td>
                    <td className="table-cell">
                      <StatusPill tone={item.isPublished ? 'green' : 'gray'}>
                        {item.isPublished ? 'Published' : 'Draft'}
                      </StatusPill>
                    </td>
                    <td className="table-cell hidden text-slate-500 sm:table-cell">
                      {item.lastDateFormatted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
