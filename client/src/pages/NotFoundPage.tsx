import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '@/hooks/authContext';
import { Card } from '@/components/ui';

export function NotFoundPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const home = isAdmin ? '/admin/dashboard' : isAuthenticated ? '/student/dashboard' : '/login';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Compass className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          The page you are looking for does not exist, or you may not have permission to view it.
        </p>
        <Link to={home} className="btn-primary mt-6">
          Back to dashboard
        </Link>
      </Card>
    </div>
  );
}
