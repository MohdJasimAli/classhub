import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { GraduationCap, Lock, Mail, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/authContext';
import { ApiError } from '@/services/api';
import { ErrorBanner, Spinner } from '@/components/States';
import { LoadingState } from '@/components/States';

export function LoginPage() {
  const { login, isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return <FullPageLoader />;
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? (isAdmin ? '/admin/dashboard' : '/student/dashboard')} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(user.role === 'ADMIN' ? '/admin/dashboard' : '/student/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fieldErrors[0] ?? err.message);
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to ClassHub"
      subtitle="Access your quizzes, assignments and results."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorBanner message={error} />}

        <div>
          <label htmlFor="email" className="label">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input pl-9"
              placeholder="you@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input pl-9"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner className="h-4 w-4 text-white" /> : null}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register, isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return <FullPageLoader />;
  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/admin/dashboard' : '/student/dashboard'} replace />;
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      toast.success('Account created. Welcome to ClassHub!');
      navigate('/student/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors[0] ?? err.message) : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your student account"
      subtitle="Register to receive quizzes and assignments from your class."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorBanner message={error} />}

        <div>
          <label htmlFor="name" className="label">Full name</label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="name" className="input pl-9" required autoComplete="name"
              placeholder="Jane Doe" value={form.name} onChange={set('name')} />
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" className="label">Email address</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="reg-email" type="email" required autoComplete="email" className="input pl-9"
              placeholder="you@college.edu" value={form.email} onChange={set('email')} />
          </div>
        </div>

        <div>
          <label htmlFor="reg-password" className="label">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="reg-password" type="password" required autoComplete="new-password" className="input pl-9"
              placeholder="At least 8 characters" value={form.password} onChange={set('password')} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Must include an uppercase letter, a lowercase letter and a number.
          </p>
        </div>

        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="confirm" type="password" required autoComplete="new-password" className="input pl-9"
              placeholder="Re-enter your password" value={form.confirm} onChange={set('confirm')} />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50/40 to-slate-100 px-4 py-8 sm:py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="card p-6">{children}</div>

        <p className="mt-5 text-center text-sm text-slate-600">
          {title.startsWith('Sign in') ? (
            <>
              No account yet?{' '}
              <Link to="/register" className="font-semibold text-brand-700 hover:underline">
                Register as a student
              </Link>
            </>
          ) : (
            <>
              Already registered?{' '}
              <Link to="/login" className="font-semibold text-brand-700 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <LoadingState label="Restoring your session…" />
    </div>
  );
}
