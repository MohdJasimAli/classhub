import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, StudentLayout } from '@/layouts/AppLayout';
import { ProtectedRoutes, RoleGate } from '@/routes/guards';
import { LoadingState } from '@/components/States';
import { LoginPage, RegisterPage } from '@/pages/LoginPage';
import { ProfilePage } from '@/pages/ProfilePage';

// Route-level code splitting keeps the initial bundle small; the login screen
// must load instantly, so the authenticated areas are lazy.
const StudentDashboard = lazy(() =>
  import('@/pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboardPage })),
);
const StudentResources = lazy(() =>
  import('@/pages/student/StudentResources').then((m) => ({ default: m.StudentResourceListPage })),
);
const StudentResourceDetail = lazy(() =>
  import('@/pages/student/StudentResourceDetail').then((m) => ({ default: m.StudentResourceDetailPage })),
);

const AdminDashboard = lazy(() =>
  import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminResources = lazy(() =>
  import('@/pages/admin/AdminResources').then((m) => ({ default: m.AdminResourceListPage })),
);
const AdminResourceEditor = lazy(() =>
  import('@/pages/admin/AdminResourceEditor').then((m) => ({ default: m.AdminResourceEditorPage })),
);
const AdminStudents = lazy(() =>
  import('@/pages/admin/AdminStudents').then((m) => ({ default: m.AdminStudentsPage })),
);

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Authenticated shell: validates the session and blocks cross-role access */}
        <Route element={<ProtectedRoutes />}>
          {/* ------------------------- Student ------------------------- */}
          <Route element={<RoleGate role="STUDENT" />}>
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="resources" element={<StudentResources />} />
              <Route path="resources/:id" element={<StudentResourceDetail />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          {/* -------------------------- Admin -------------------------- */}
          <Route element={<RoleGate role="ADMIN" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="resources" element={<AdminResources />} />
              <Route path="resources/new" element={<AdminResourceEditor />} />
              <Route path="resources/:id" element={<AdminResourceEditor />} />
              <Route path="students" element={<AdminStudents />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <LoadingState label="Loading ClassHub…" />
    </div>
  );
}
