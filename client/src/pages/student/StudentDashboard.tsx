import { Link } from 'react-router-dom';
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  FileText,
  HelpCircle,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { useDashboard } from '@/hooks/useApi';
import { useAuth } from '@/hooks/authContext';
import { Card, CardHeader, DeadlineRow, StatCard } from '@/components/ui';
import { EmptyState, ErrorState, SkeletonCards } from '@/components/States';

/**
 * Student home. Students read material here - nothing is submittable, so the
 * whole screen is oriented around "what is coming up and what can I read now".
 */
export function StudentDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-32 w-full rounded-xl" />
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (isError || !data || data.role !== 'STUDENT') {
    return (
      <ErrorState
        title="Could not load your dashboard"
        message={error?.message}
        onRetry={() => void refetch()}
      />
    );
  }

  const { stats, upcoming, all } = data;
  const firstName = user?.name.split(' ')[0] ?? 'there';
  const nextUp = upcoming[0];

  return (
    <div className="space-y-6">
      {/* ------------------------------ Welcome ------------------------------ */}
      <section className="overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 p-6 text-white shadow-card sm:p-8">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Student portal
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-brand-100">
          {nextUp
            ? `Your next last date is ${nextUp.title} on ${nextUp.lastDateFormatted}. The question and the answer are both available now.`
            : stats.totalResources > 0
              ? 'All your material is past its last date. Check back for new uploads.'
              : 'Nothing has been published yet. Your teacher will upload questions and answers here.'}
        </p>

        {nextUp && (
          <Link
            to={`/student/resources/${nextUp.id}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            Open {nextUp.title}
          </Link>
        )}
      </section>

      {/* ------------------------------- Stats -------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available material"
          value={stats.totalResources}
          hint={`${stats.quizzes} quiz · ${stats.assignments} assignment`}
          icon={<BookOpen className="h-4 w-4" aria-hidden />}
          tone="violet"
          to="/student/resources"
        />
        <StatCard
          label="Open now"
          value={stats.activeNow}
          hint="Last date still in the future"
          icon={<FileText className="h-4 w-4" aria-hidden />}
          tone="brand"
          to="/student/resources?status=upcoming"
        />
        <StatCard
          label="Last dates approaching"
          value={stats.upcomingLastDates}
          hint="Due within the next 14 days"
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          tone="amber"
        />
        <StatCard
          label="Unread notifications"
          value={stats.unreadNotifications}
          hint={stats.unreadNotifications > 0 ? 'Check the bell menu' : 'You are up to date'}
          icon={<AlarmClock className="h-4 w-4" aria-hidden />}
          tone="emerald"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------- Upcoming last dates ---------------------- */}
        <Card>
          <CardHeader
            title="Last dates approaching"
            subtitle="Due within the next 14 days"
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
            action={
              <Link to="/student/resources" className="text-xs font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing due in the next two weeks"
              description="You are clear for now. New material will appear here as soon as it is published."
              icon={<CalendarClock className="h-6 w-6" aria-hidden />}
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
                    to={`/student/resources/${item.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------------ All material ------------------------ */}
        <Card>
          <CardHeader
            title="Available material"
            subtitle="Questions and answers you can read now"
            icon={<BookOpen className="h-4 w-4" aria-hidden />}
            action={
              <Link to="/student/resources" className="text-xs font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {all.length === 0 ? (
            <EmptyState
              title="No material yet"
              description="Your teacher has not published anything so far."
              icon={<BookOpen className="h-6 w-6" aria-hidden />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {all.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/student/resources/${item.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.type === 'QUIZ' ? 'Quiz' : 'Assignment'} · {item.lastDateFormatted}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-brand-700">
                      {item.phase === 'EXPIRED' ? 'Read' : 'Open'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------ How it works -------------------------- */}
      <Card>
        <CardHeader title="How this works" subtitle="A quick guide" icon={<Lightbulb className="h-4 w-4" aria-hidden />} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            {
              title: 'Read the question',
              body: 'Each item has a question, either typed in the browser or attached as a file you can download.',
            },
            {
              title: 'Check the answer',
              body: 'Model answers sit alongside the question, so you can self-assess straight away.',
            },
            {
              title: 'Watch the last date',
              body: 'You get a reminder 24 hours before the last date. There is nothing to submit.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg bg-slate-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <HelpCircle className="h-4 w-4 text-brand-500" aria-hidden />
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
