import { useState, type FormEvent } from 'react';
import { KeyRound, Mail, Save, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError } from '@/services/api';
import { useAuth } from '@/hooks/authContext';
import { Avatar, Card, CardHeader, StatusPill } from '@/components/ui';
import { ErrorBanner } from '@/components/States';
import { formatDate } from '@/utils';

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: () => authApi.updateProfile(name.trim()),
    onSuccess: async () => {
      toast.success('Profile updated');
      await refresh();
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: Error) => {
      const message = e instanceof ApiError ? (e.fieldErrors[0] ?? e.message) : 'Unable to update your profile.';
      setNameError(message);
    },
  });

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword(passwords.current, passwords.next),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setPasswords({ current: '', next: '', confirm: '' });
    },
    onError: (e: Error) => {
      setPasswordError(
        e instanceof ApiError ? (e.fieldErrors[0] ?? e.message) : 'Unable to change your password.',
      );
    },
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-0.5 text-sm text-slate-500">Manage your account details and password</p>
      </header>

      <Card>
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 p-5">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill tone={user.role === 'ADMIN' ? 'brand' : 'violet'}>
                {user.role === 'ADMIN' ? 'Administrator' : 'Student'}
              </StatusPill>
              {user.studentCode && <StatusPill tone="gray">{user.studentCode}</StatusPill>}
            </div>
          </div>
        </div>

        <dl className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white px-5 py-3.5">
            <dt className="text-xs text-slate-500">Account created</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800">
              {user.createdAt ? formatDate(user.createdAt) : '—'}
            </dd>
          </div>
          <div className="bg-white px-5 py-3.5">
            <dt className="text-xs text-slate-500">Last sign in</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800">
              {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'This session'}
            </dd>
          </div>
          <div className="bg-white px-5 py-3.5">
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="mt-1">
              <StatusPill tone={user.isActive ? 'green' : 'gray'}>
                {user.isActive ? 'Active' : 'Deactivated'}
              </StatusPill>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Display name" subtitle="This is how your name appears to your teacher" />
        <form
          className="space-y-4 p-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setNameError(null);
            if (name.trim().length < 2) {
              setNameError('Your name must be at least 2 characters.');
              return;
            }
            saveProfile.mutate();
          }}
        >
          {nameError && <ErrorBanner message={nameError} />}
          <div>
            <label htmlFor="profile-name" className="label">Full name</label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="profile-name"
                className="input pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saveProfile.isPending || name.trim() === user.name}>
              <Save className="h-4 w-4" aria-hidden />
              {saveProfile.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Change password" subtitle="Choose a strong password you do not use elsewhere" />
        <form
          className="space-y-4 p-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setPasswordError(null);
            if (passwords.next !== passwords.confirm) {
              setPasswordError('The two new passwords do not match.');
              return;
            }
            changePassword.mutate();
          }}
        >
          {passwordError && <ErrorBanner message={passwordError} />}

          <div>
            <label htmlFor="current-pw" className="label">Current password</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="current-pw"
                type="password"
                autoComplete="current-password"
                required
                className="input pl-9"
                value={passwords.current}
                onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-pw" className="label">New password</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="new-pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="input pl-9"
                  value={passwords.next}
                  onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label htmlFor="confirm-pw" className="label">Confirm new password</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="confirm-pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="input pl-9"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Minimum 8 characters, including an uppercase letter, a lowercase letter and a number.
          </p>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={changePassword.isPending}>
              <KeyRound className="h-4 w-4" aria-hidden />
              {changePassword.isPending ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-800">Signed in as</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
