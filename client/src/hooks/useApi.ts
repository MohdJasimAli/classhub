import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  adminApi,
  dashboardApi,
  notificationApi,
  resourceApi,
  ApiError,
  type ApiEnvelope,
} from '@/services/api';
import type { PageMeta, Resource, StudentRow } from '@/types';

/**
 * Central React Query hooks.
 *
 * Keeping them in one place means query keys are defined once and cache
 * invalidation after a mutation is consistent across the app.
 */

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  resources: (params?: unknown) => ['resources', params ?? {}] as const,
  resource: (id: string) => ['resource', id] as const,
  notifications: (params?: unknown) => ['notifications', params ?? {}] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  students: (params?: unknown) => ['students', params ?? {}] as const,
  reminders: ['reminders'] as const,
};

type Options<T> = Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>;

interface Paged<T> {
  items: T[];
  meta?: PageMeta;
}

function useApiQuery<TResponse, TData>(
  key: readonly unknown[],
  fn: () => Promise<ApiEnvelope<TResponse>>,
  select: (data: TResponse, meta?: PageMeta) => TData,
  options: Options<TData> = {},
) {
  return useQuery({
    queryKey: key as unknown as readonly unknown[],
    queryFn: async () => {
      const envelope = await fn();
      return select(envelope.data, envelope.meta);
    },
    ...options,
  });
}

// ----------------------------- Dashboard -----------------------------------

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: dashboardApi.get });

// ----------------------------- Resources -----------------------------------

export const useResources = (
  params: { page?: number; limit?: number; search?: string; type?: string; status?: string } = {},
) => useApiQuery<Resource[], Paged<Resource>>(
  queryKeys.resources(params),
  () => resourceApi.list(params),
  (items, meta) => ({ items, meta }),
);

export const useResource = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.resource(id ?? ''),
    queryFn: () => resourceApi.get(id as string),
    enabled: Boolean(id),
  });

/** Invalidates everything a resource edit can affect. */
export function useInvalidateResources() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['resources'] });
    void qc.invalidateQueries({ queryKey: ['resource'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['reminders'] });
  };
}

// ----------------------------- Notifications -------------------------------

export const useNotifications = (params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn: async () => {
      const envelope = await notificationApi.list(params);
      return { items: envelope.data.items, unreadCount: envelope.data.unreadCount, meta: envelope.meta };
    },
  });

/**
 * Unread badge counter. Polls slowly so a reminder that lands while the tab is
 * open shows up without a manual refresh.
 */
export const useUnreadCount = () =>
  useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: notificationApi.unreadCount,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

// --------------------------------- Admin -----------------------------------

export const useStudents = (
  params: { page?: number; limit?: number; search?: string; status?: string } = {},
) => useApiQuery<StudentRow[], Paged<StudentRow>>(
  queryKeys.students(params),
  () => adminApi.students(params),
  (items, meta) => ({ items, meta }),
);

export const useReminders = (limit = 50) =>
  useQuery({ queryKey: queryKeys.reminders, queryFn: () => adminApi.reminders(limit) });
