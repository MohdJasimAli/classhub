import { useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, RotateCcw, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiError } from '@/services/api';
import { useStudents } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useCountdown';
import { Card, CardHeader, StatCard, StatusPill, Avatar } from '@/components/ui';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { EmptyState, ErrorBanner, ErrorState, SkeletonTable } from '@/components/States';
import { cn, formatDate } from '@/utils';
import type { StudentRow } from '@/types';

export function AdminStudentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudentRow | null>(null);
  const debounced = useDebounced(search);

  const { data, isLoading, isError, error, refetch } = useStudents({
    search: debounced || undefined,
    status,
    limit: 100,
  });

  const students = data?.items ?? [];
  const active = students.filter((s) => s.isActive).length;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['students'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updateStudent(id, { isActive }),
    onSuccess: (result) => {
      toast.success(result.student.isActive ? 'Student reactivated' : 'Student deactivated');
      setPendingDelete(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e instanceof ApiError ? e.message : 'Update failed');
      setPendingDelete(null);
    },
  });

  const destroy = useMutation({
    mutationFn: (id: string) => adminApi.removeStudent(id, true),
    onSuccess: () => {
      toast.success('Student permanently deleted');
      setPendingDelete(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed');
      setPendingDelete(null);
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Students</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {students.length} student{students.length === 1 ? '' : 's'} · {active} active
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/admin/students/export" className="btn-secondary btn-sm" download>
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </a>
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add student
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total students" value={students.length} icon={<Users className="h-4 w-4" aria-hidden />} />
        <StatCard label="Active" value={active} tone="emerald" icon={<UserCheck className="h-4 w-4" aria-hidden />} />
        <StatCard label="Inactive" value={students.length - active} tone="slate" icon={<UserX className="h-4 w-4" aria-hidden />} />
      </section>

      <Card className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            className="input pl-9"
            placeholder="Search by name, email or student code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search students"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                status === option.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && <SkeletonTable rows={6} cols={5} />}
      {isError && <ErrorState message={error?.message} onRetry={() => void refetch()} />}

      {!isLoading && !isError && students.length === 0 && (
        <Card>
          <EmptyState
            title="No students found"
            description={debounced ? `Nothing matches "${debounced}".` : 'Add your first student to get started.'}
            icon={<Users className="h-6 w-6" aria-hidden />}
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add student
              </button>
            }
          />
        </Card>
      )}

      {students.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Class roster" subtitle="Search, edit, deactivate or remove students" />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                {/* Secondary columns collapse on phones. */}
                <tr>
                  <th className="table-header">Student</th>
                  <th className="table-header hidden sm:table-cell">Code</th>
                  <th className="table-header hidden lg:table-cell">Last sign in</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-slate-50">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={student.name} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{student.name}</p>
                          <p className="truncate text-xs text-slate-500">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell hidden text-slate-500 sm:table-cell">
                      {student.studentCode ?? '-'}
                    </td>
                    <td className="table-cell hidden text-slate-500 lg:table-cell">
                      {student.lastLoginAt ? formatDate(student.lastLoginAt) : 'Never'}
                    </td>
                    <td className="table-cell">
                      <StatusPill tone={student.isActive ? 'green' : 'gray'}>
                        {student.isActive ? 'Active' : 'Inactive'}
                      </StatusPill>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setEditing(student)}
                          title="Edit student"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          title={student.isActive ? 'Deactivate' : 'Reactivate'}
                          onClick={() =>
                            toggleActive.mutate({ id: student.id, isActive: !student.isActive })
                          }
                        >
                          {student.isActive ? (
                            <UserX className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                          title="Delete permanently"
                          onClick={() => setPendingDelete(student)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <StudentFormModal open={showCreate} key="create" onClose={() => setShowCreate(false)} onSaved={invalidate} />
      <StudentFormModal
        open={Boolean(editing)}
        key={editing?.id ?? 'edit'}
        student={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />

      {/* Active accounts are deactivated first so history is preserved. */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.isActive) {
            toggleActive.mutate({ id: pendingDelete.id, isActive: false });
          } else {
            destroy.mutate(pendingDelete.id);
          }
        }}
        title={pendingDelete?.isActive ? 'Deactivate this student?' : 'Permanently delete this student?'}
        confirmLabel={pendingDelete?.isActive ? 'Deactivate' : 'Delete permanently'}
        isPending={toggleActive.isPending || destroy.isPending}
        message={
          pendingDelete?.isActive
            ? `${pendingDelete?.name} will be signed out and unable to sign in. Their notifications are preserved and the account can be reactivated at any time.`
            : `${pendingDelete?.name} and their notifications will be permanently removed. This cannot be undone.`
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StudentFormModal({
  open,
  onClose,
  onSaved,
  student,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  student?: StudentRow;
}) {
  const isEdit = Boolean(student);
  // The parent supplies a `key` that changes per student, so this component
  // remounts with fresh initial state and needs no synchronising effect.
  const [form, setForm] = useState({
    name: student?.name ?? '',
    email: student?.email ?? '',
    studentCode: student?.studentCode ?? '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (isEdit && student) {
        return adminApi.updateStudent(student.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          studentCode: form.studentCode.trim() || null,
        });
      }
      return adminApi.createStudent({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        studentCode: form.studentCode.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Student updated' : 'Student created');
      onSaved();
      onClose();
    },
    onError: (e: Error) => {
      setError(e instanceof ApiError ? (e.fieldErrors[0] ?? e.message) : 'Unable to save the student.');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('Please enter the student\'s full name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Please enter a valid email address.');
    if (!isEdit && form.password.length < 8) {
      return setError(
        'The temporary password must be at least 8 characters and include upper case, lower case and a number.',
      );
    }
    save.mutate();
  };

  const set = (keyName: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [keyName]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit student' : 'Add a new student'}
      description={isEdit ? student?.email : 'They can sign in immediately with the password you set.'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" form="student-form" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create student'}
          </button>
        </>
      }
    >
      <form id="student-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorBanner message={error} />}

        <div>
          <label htmlFor="s-name" className="label">Full name</label>
          <input id="s-name" className="input" value={form.name} onChange={set('name')} required placeholder="Jane Doe" />
        </div>

        <div>
          <label htmlFor="s-email" className="label">Email address</label>
          <input id="s-email" type="email" className="input" value={form.email} onChange={set('email')} required placeholder="jane@college.edu" />
        </div>

        <div>
          <label htmlFor="s-code" className="label">
            Student code <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="s-code" className="input" value={form.studentCode} onChange={set('studentCode')} placeholder="CSE-2026-001" />
        </div>

        {!isEdit && (
          <div>
            <label htmlFor="s-password" className="label">Temporary password</label>
            <input
              id="s-password"
              type="text"
              className="input"
              value={form.password}
              onChange={set('password')}
              required
              placeholder="At least 8 characters"
            />
            <p className="mt-1 text-xs text-slate-500">
              Must include an uppercase letter, a lowercase letter and a number. Share it securely.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
