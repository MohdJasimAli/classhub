import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/authContext';
import { Avatar } from '@/components/ui';
import { NotificationBell } from '@/components/NotificationCenter';
import { cn } from '@/utils';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const STUDENT_NAV: NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/student/resources', label: 'Material', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { to: '/student/profile', label: 'Profile', icon: <Settings className="h-[18px] w-[18px]" /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/admin/resources', label: 'Material', icon: <BookOpen className="h-[18px] w-[18px]" /> },
  { to: '/admin/students', label: 'Students', icon: <Users className="h-[18px] w-[18px]" /> },
  { to: '/admin/profile', label: 'Profile', icon: <Settings className="h-[18px] w-[18px]" /> },
];

/**
 * Authenticated shell: fixed sidebar on desktop, slide-over drawer on mobile,
 * and a top bar carrying the notification centre and account menu.
 */
export function AppLayout({ nav }: { nav: NavItem[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const closeDrawer = () => setMobileOpen(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 pt-safe sm:px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-900">ClassHub</p>
          <p className="truncate text-[11px] font-medium text-slate-500">
            {isAdmin ? 'Administrator' : 'Student Portal'}
          </p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={closeDrawer}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3 pb-safe">
        <Link
          to={isAdmin ? '/admin/profile' : '/student/profile'}
          onClick={closeDrawer}
          className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-100"
        >
          <Avatar name={user?.name ?? '?'} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
          </div>
        </Link>
        <button type="button" onClick={handleLogout} className="btn-ghost btn-sm mt-1 w-full justify-start">
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 max-w-[85vw] bg-white shadow-modal lg:hidden animate-slide-in-right">
            {sidebar}
          </aside>
        </>
      )}

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 pt-safe backdrop-blur sm:gap-3 sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {greeting()}, {user?.name?.split(' ')[0]}
            </p>
            <p className="truncate text-xs text-slate-500">
              {isAdmin ? 'Publish questions and answers' : 'Read your questions and answers'}
            </p>
          </div>

          <NotificationBell />
        </header>

        {/* Bottom padding clears the iOS home indicator on touch devices. */}
        <main className="px-4 py-5 pb-8 sm:px-6 sm:py-6 lg:px-8 pb-safe">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function StudentLayout() {
  return <AppLayout nav={STUDENT_NAV} />;
}

export function AdminLayout() {
  return <AppLayout nav={ADMIN_NAV} />;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
