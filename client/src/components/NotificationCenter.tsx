import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Circle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notificationApi } from '@/services/api';
import { useNotifications, useUnreadCount } from '@/hooks/useApi';
import { EmptyState, ErrorBanner } from '@/components/States';
import { cn, relativeTime } from '@/utils';
import type { AppNotification, NotificationType } from '@/types';

const TYPE_STYLES: Record<NotificationType, { dot: string; label: string }> = {
  DEADLINE_UPCOMING: { dot: 'bg-violet-500', label: 'New material' },
  DEADLINE_REMINDER: { dot: 'bg-amber-500', label: 'Last date reminder' },
};

/**
 * In-app notification centre: a slide-over panel with unread count, per-item
 * and mark-all-as-read actions.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: countData } = useUnreadCount();
  const unread = countData?.count ?? 0;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] animate-slide-in-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-modal sm:w-96">
          <NotificationPanel onChanged={invalidate} />
        </div>
      )}
    </div>
  );
}

function NotificationPanel({ onChanged }: { onChanged: () => void }) {
  const { data, isLoading, error } = useNotifications({ limit: 30 });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: (res) => {
      toast.success(`${res.updated} notification${res.updated === 1 ? '' : 's'} marked as read`);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="flex max-h-[28rem] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
          {unread > 0 && (
            <p className="text-xs text-slate-500">{unread} unread</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className="btn-ghost btn-sm"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          Mark all read
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="px-4 py-8 text-center text-sm text-slate-500">Loading…</div>}

        {error && <ErrorBanner message={error.message} className="m-3" />}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            title="No notifications yet"
            description="Deadline reminders and submission confirmations will appear here."
            icon={<Bell className="h-6 w-6" aria-hidden />}
          />
        )}

        {items.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onRead={() => !notification.readAt && markRead.mutate(notification.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: () => void;
}) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.DEADLINE_UPCOMING;
  const isUnread = !notification.readAt;

  const body = (
    <div
      className={cn(
        'flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50',
        isUnread && 'bg-brand-50/40',
      )}
    >
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm', isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
            {notification.title}
          </p>
          {isUnread && <Circle className="mt-0.5 h-3 w-3 shrink-0 fill-brand-500 text-brand-500" aria-label="Unread" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.message}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">
          {style.label} · {relativeTime(notification.createdAt)}
        </p>
      </div>
    </div>
  );

  if (notification.link) {
    return (
      <Link
        to={notification.link}
        onClick={onRead}
        className="block focus-visible:bg-slate-50"
      >
        {body}
      </Link>
    );
  }
  return <button type="button" onClick={onRead} className="block w-full">{body}</button>;
}
