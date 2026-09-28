import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/authContext';
import { LoadingState } from '@/components/States';
import type { Role } from '@/types';

/**
 * Route guards.
 *
 * These are a UX convenience only. The real enforcement lives on the server
 * (`requireAuth` / `requireRole`), so a user who hand-crafts a URL still hits
 * a 403 from the API - the client guard just avoids showing them a page that
 * could never work.
 */

function SessionGate() {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState label="Loading ClassHub…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // An admin landing on a student URL is redirected to their own home.
  if (location.pathname.startsWith('/student') && isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (location.pathname.startsWith('/admin') && !isAdmin) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <Outlet />;
}

export function ProtectedRoutes() {
  // SessionGate already renders an <Outlet /> for the nested routes.
  return <SessionGate />;
}

export function RoleGate({ role }: { role: Role }) {
  const { isAdmin } = useAuth();
  const home = isAdmin ? '/admin/dashboard' : '/student/dashboard';

  if (role === 'ADMIN' && !isAdmin) return <Navigate to={home} replace />;
  if (role === 'STUDENT' && isAdmin) return <Navigate to={home} replace />;
  return <Outlet />;
}
