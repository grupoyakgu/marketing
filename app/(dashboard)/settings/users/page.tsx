'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { UserPlus, Trash2, KeyRound } from 'lucide-react';

interface UserRow {
  id: string;
  username: string;
  role: 'admin' | 'user';
  disabled: boolean;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load users.');
      setUsers(body.users ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to create user.');
        return;
      }
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleDisabled(user: UserRow) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: !user.disabled }),
    });
    await load();
  }

  async function changeRole(user: UserRow, role: 'admin' | 'user') {
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function resetPassword(user: UserRow) {
    const password = window.prompt(`New password for ${user.username}:`);
    if (!password) return;
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  }

  async function removeUser(user: UserRow) {
    if (!window.confirm(`Delete ${user.username}? This can't be undone.`)) return;
    await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Users</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Manage who can access this dashboard.
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">Add user</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-neutral-500">Username</label>
            <input
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              required
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-neutral-500">Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Role</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button type="submit" disabled={creating}>
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      <Card className="p-0">
        {users === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-400">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400 dark:border-neutral-800">
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                  <td className="px-5 py-3 font-medium text-neutral-900 dark:text-white">{user.username}</td>
                  <td className="px-5 py-3">
                    <select
                      value={user.role}
                      onChange={e => changeRole(user, e.target.value as 'admin' | 'user')}
                      className="rounded-lg border border-neutral-200 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={user.disabled ? 'negative' : 'positive'}>
                      {user.disabled ? 'Disabled' : 'Active'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" onClick={() => resetPassword(user)} title="Reset password">
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="secondary" onClick={() => toggleDisabled(user)}>
                        {user.disabled ? 'Enable' : 'Disable'}
                      </Button>
                      <Button variant="danger" onClick={() => removeUser(user)} title="Delete user">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
