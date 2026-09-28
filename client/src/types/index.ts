/**
 * Shared API types. These mirror the JSON the Express API returns, so the
 * client never has to guess at a field name.
 */

export type Role = 'ADMIN' | 'STUDENT';

export type ResourceType = 'QUIZ' | 'ASSIGNMENT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  studentCode: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export type DeadlinePhase = 'OPEN' | 'APPROACHING' | 'CRITICAL' | 'EXPIRED' | 'UPCOMING' | 'SUBMITTED';

export interface AttachedFile {
  name: string;
  size: number | null;
  url: string;
}

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  questionText: string | null;
  questionFile: AttachedFile | null;
  answerText: string | null;
  answerFile: AttachedFile | null;
  hasQuestion: boolean;
  hasAnswer: boolean;
  lastDate: string;
  lastDateFormatted: string;
  isPublished: boolean;
  msRemaining: number;
  countdown: string;
  phase: DeadlinePhase;
  past: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compact shape used on the dashboards. */
export interface ResourceBrief {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  lastDate: string;
  lastDateFormatted: string;
  countdown: string;
  remaining: string;
  phase: DeadlinePhase;
  isPublished: boolean;
  hasQuestion: boolean;
  hasAnswer: boolean;
}

export interface AdminDashboard {
  role: 'ADMIN';
  stats: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    totalResources: number;
    publishedResources: number;
    draftResources: number;
    quizzes: number;
    assignments: number;
    activeNow: number;
    upcomingLastDates: number;
    pastLastDate: number;
    unreadNotifications: number;
  };
  upcoming: ResourceBrief[];
  recent: ResourceBrief[];
  all: ResourceBrief[];
}

export interface StudentDashboard {
  role: 'STUDENT';
  stats: {
    totalResources: number;
    quizzes: number;
    assignments: number;
    activeNow: number;
    upcomingLastDates: number;
    pastLastDate: number;
    unreadNotifications: number;
  };
  upcoming: ResourceBrief[];
  recent: ResourceBrief[];
  all: ResourceBrief[];
}

export type Dashboard = AdminDashboard | StudentDashboard;

export type NotificationType = 'DEADLINE_UPCOMING' | 'DEADLINE_REMINDER';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface StudentRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  studentCode: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
