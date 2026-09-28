import axios, { AxiosError } from 'axios';
import type {
  AppNotification,
  Dashboard,
  PageMeta,
  Resource,
  ResourceType,
  StudentRow,
  User,
} from '@/types';

export interface ApiEnvelope<T> {
  success: true;
  message?: string;
  data: T;
  meta?: PageMeta;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Flattens Zod field errors into readable "field: message" strings. */
  get fieldErrors(): string[] {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    if (!d?.fieldErrors) return [];
    return Object.entries(d.fieldErrors).flatMap(([field, messages]) =>
      messages.map((m) => `${field}: ${m}`),
    );
  }
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/** Unwraps the `{ success, data, meta }` envelope, throwing ApiError on failure. */
async function request<T>(config: Parameters<typeof http.request>[0]): Promise<ApiEnvelope<T>> {
  try {
    const response = await http.request<ApiEnvelope<T>>(config);
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      if (!error.response) {
        throw new ApiError(
          'Cannot reach the server. Check that the API is running.',
          0,
          'NETWORK_ERROR',
        );
      }
      const body = error.response.data as {
        error?: { message?: string; code?: string; details?: unknown };
      };
      throw new ApiError(
        body?.error?.message || `Request failed with status ${error.response.status}`,
        error.response.status,
        body?.error?.code || 'UNKNOWN',
        body?.error?.details,
      );
    }
    throw error;
  }
}

const unwrap = async <T>(config: Parameters<typeof http.request>[0]): Promise<T> =>
  (await request<T>(config)).data;

/** Returns the whole envelope, so callers that need pagination meta can use it. */
export const apiEnvelope = request;

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    unwrap<{ user: User; token: string }>({
      url: '/auth/login',
      method: 'POST',
      data: { email, password },
    }),
  register: (name: string, email: string, password: string) =>
    unwrap<{ user: User; token: string }>({
      url: '/auth/register',
      method: 'POST',
      data: { name, email, password },
    }),
  me: () => unwrap<{ user: User }>({ url: '/auth/me' }),
  logout: () => unwrap<null>({ url: '/auth/logout', method: 'POST' }),
  updateProfile: (name: string) =>
    unwrap<{ user: User }>({ url: '/auth/profile', method: 'PUT', data: { name } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    unwrap<null>({
      url: '/auth/password',
      method: 'PUT',
      data: { currentPassword, newPassword },
    }),
};

export const dashboardApi = {
  get: () => unwrap<Dashboard>({ url: '/dashboard' }),
};

export interface ResourcePayload {
  type: ResourceType;
  title: string;
  description?: string | null;
  questionText?: string | null;
  answerText?: string | null;
  lastDate: string;
  isPublished?: boolean;
}

export const resourceApi = {
  list: (params: { page?: number; limit?: number; search?: string; type?: string; status?: string } = {}) =>
    apiEnvelope<Resource[]>({ url: '/resources', params }),
  get: (id: string) => unwrap<Resource>({ url: `/resources/${id}` }),

  /** Question and answer are multipart so each can carry a file. */
  create: (form: FormData) =>
    unwrap<Resource>({
      url: '/resources',
      method: 'POST',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id: string, form: FormData) =>
    unwrap<Resource>({
      url: `/resources/${id}`,
      method: 'PUT',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  setPublished: (id: string, isPublished: boolean) =>
    unwrap<Resource>({ url: `/resources/${id}/publish`, method: 'PATCH', data: { isPublished } }),
  remove: (id: string) => unwrap<null>({ url: `/resources/${id}`, method: 'DELETE' }),
};

export const notificationApi = {
  list: (params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
    apiEnvelope<{ items: AppNotification[]; unreadCount: number }>({
      url: '/notifications',
      params: { ...params, ...(params.unreadOnly ? { unreadOnly: 'true' } : {}) },
    }),
  unreadCount: () => unwrap<{ count: number }>({ url: '/notifications/unread-count' }),
  markRead: (id: string) =>
    unwrap<{ id: string; unreadCount: number }>({
      url: `/notifications/${id}/read`,
      method: 'PATCH',
    }),
  markUnread: (id: string) =>
    unwrap<{ id: string; unreadCount: number }>({
      url: `/notifications/${id}/unread`,
      method: 'PATCH',
    }),
  markAllRead: () =>
    unwrap<{ updated: number; unreadCount: number }>({
      url: '/notifications/read-all',
      method: 'PATCH',
    }),
  remove: (id: string) => unwrap<unknown>({ url: `/notifications/${id}`, method: 'DELETE' }),

  /**
   * Sends a diagnostic message to the signed-in admin. The response reports
   * the resolved transport, so "captured" vs "sent over SMTP" is unambiguous.
   */
  sendTestEmail: () =>
    unwrap<{
      sent: boolean;
      error?: string;
      transport: {
        mode: 'SMTP' | 'CAPTURE';
        delivered: boolean;
        host: string;
        port: number | null;
        secure: boolean | null;
        user: string | null;
        from: string;
      };
    }>({ url: '/notifications/test-email', method: 'POST' }),
};

export const adminApi = {
  students: (params: { page?: number; limit?: number; search?: string; status?: string } = {}) =>
    apiEnvelope<StudentRow[]>({ url: '/admin/students', params }),
  student: (id: string) => unwrap<unknown>({ url: `/admin/students/${id}` }),
  createStudent: (payload: { name: string; email: string; password: string; studentCode?: string }) =>
    unwrap<{ student: User }>({ url: '/auth/students', method: 'POST', data: payload }),
  updateStudent: (id: string, payload: Record<string, unknown>) =>
    unwrap<{ student: User }>({ url: `/admin/students/${id}`, method: 'PUT', data: payload }),
  removeStudent: (id: string, hard = false) =>
    unwrap<unknown>({ url: `/admin/students/${id}`, method: 'DELETE', params: { hard: String(hard) } }),
  reminders: (limit = 50) =>
    unwrap<Array<Record<string, unknown>>>({ url: '/admin/reminders', params: { limit } }),
  runReminderSweep: () =>
    unwrap<{
      ranAt: string;
      resourcesConsidered: number;
      remindersCreated: number;
      emailsSent: number;
      duplicatesPrevented: number;
    }>({ url: '/admin/reminders/run', method: 'POST' }),
};

/**
 * Builds a download URL for a stored file.
 *
 * The API returns a path relative to the API root (e.g. `/files/<name>`) and
 * this helper is the single place that composes the final URL, because only the
 * client knows whether `VITE_API_URL` is the relative dev proxy (`/api`) or an
 * absolute cross-origin API. Prefixing unconditionally also makes it impossible
 * to end up with a doubled `/api/api/...`.
 *
 * The API is cookie/Bearer authenticated, so a plain anchor works in the app.
 */
export function fileUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  const base = String(http.defaults.baseURL || '/api').replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!base || base === '/') return suffix;
  // Idempotent: do not double up if a path already carries the base. Without
  // this, an API path of "/api/files/x" became "/api/api/files/x" (404).
  return suffix === base || suffix.startsWith(`${base}/`) ? suffix : `${base}${suffix}`;
}
