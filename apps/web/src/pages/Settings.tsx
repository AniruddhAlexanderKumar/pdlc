import { useEffect, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router';
import { DashboardSettings } from '../components/dashboard/DashboardSettings';
import { AppLayoutSettings } from '../components/AppLayoutSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cookie, Copy, KeyRound, Link2, LogOut, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { CURRENCIES, type Me, type Role } from '@sv/shared';
import { del, patch, post } from '../api/client';
import { keys, useInvites, useMembers, useResetSession, useSession } from '../api/hooks';
import { getCookieConsent, openCookiePreferences } from '../lib/cookieConsent';
import { useToast } from '../components/Toast';
import { Button, Card, CardHeader, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, cx, useConfirm } from '../components/ui';

function CopyLink({ url, note, onClose }: { url: string; note: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal title="Share this link" subtitle={note} onClose={onClose} size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
        <Button
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.success('Link copied');
            } catch {
              toast.error('Copy failed. Select the link and copy it manually.');
            }
          }}
        >
          Copy
        </Button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">This link is shown only once and works a single time.</p>
    </Modal>
  );
}

function WorkspaceSettings() {
  const me = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = me.workspace.role !== 'member';
  const [name, setName] = useState(me.workspace.name);
  const [currency, setCurrency] = useState<string>(me.workspace.currency);
  useEffect(() => {
    setName(me.workspace.name);
    setCurrency(me.workspace.currency);
  }, [me.workspace]);
  const save = useMutation({
    mutationFn: () => patch<Me>('/workspace', { name, currency }),
    onSuccess: (m) => {
      qc.setQueryData(keys.me, m);
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast.success('Workspace saved');
    },
    onError: (e) => toast.error(e.message)
  });
  return (
    <Card>
      <CardHeader title="Workspace" subtitle={canEdit ? 'Name and currency for everyone in this workspace.' : 'Only owners and admins can change these.'} />
      <form
        className="grid gap-4 p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name" htmlFor="ws-name">
          <Input id="ws-name" disabled={!canEdit} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Currency" htmlFor="ws-cur">
          <Select id="ws-cur" disabled={!canEdit} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        {canEdit && (
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        )}
      </form>
    </Card>
  );
}

function WorkspaceAccess() {
  const me = useSession();
  const resetSession = useResetSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'solo' | 'team'>('team');
  const create = useMutation({
    mutationFn: () => post<Me>('/workspace/workspaces', { name: name.trim(), mode, currency: me.workspace.currency }),
    onSuccess: (next) => { resetSession(next); setName(''); toast.success(`Created ${next.workspace.name}`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const change = useMutation({
    mutationFn: (workspaceId: string) => post<Me>('/auth/switch-workspace', { workspaceId }),
    onSuccess: (next) => { resetSession(next); toast.success(`Switched to ${next.workspace.name}`); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Card><div className="space-y-4 p-4">
    <div><h2 className="font-semibold">Your workspaces</h2><p className="mt-1 text-sm text-zinc-500">Personal and team workspaces are separate. Their projects and products are not shared.</p></div>
    <label className="block max-w-md text-sm font-medium">Current workspace
      <Select aria-label="Current workspace" className="mt-1" value={me.workspace.id} disabled={change.isPending || create.isPending} onChange={(e) => change.mutate(e.target.value)}>
        {me.workspaces.map((w) => <option value={w.id} key={w.id}>{w.name} · {w.mode === 'solo' ? 'Personal' : 'Team'} · {w.role}</option>)}
      </Select>
    </label>
    <p className="text-xs text-zinc-500">{me.workspace.mode === 'solo' ? 'Personal: only you can be a member. System administrators retain their existing access.' : 'Team: owners and admins can invite members and manage roles.'}</p>
    <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <summary className="cursor-pointer text-sm font-semibold">Create a separate workspace</summary>
      <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <Field label="Workspace name" htmlFor="new-workspace-name"><Input id="new-workspace-name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="block text-sm font-medium">Workspace type<Select aria-label="New workspace type" className="mt-1" value={mode} onChange={(e) => setMode(e.target.value as 'solo' | 'team')}><option value="solo">Personal — only me</option><option value="team">Team — invite members</option></Select></label>
        <p className="text-xs text-zinc-500">The type cannot be changed later. The new workspace starts empty and uses {me.workspace.currency}.</p>
        <Button type="submit" loading={create.isPending} disabled={!name.trim() || change.isPending}>Create and switch</Button>
      </form>
    </details>
  </div></Card>;
}

function Team() {
  const me = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = me.workspace.role !== 'member';
  const members = useMembers();
  const invites = useInvites(isAdmin);
  const [link, setLink] = useState<{ url: string; note: string } | null>(null);
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');

  const onError = (e: Error) => toast.error(e.message);
  const createInvite = useMutation({
    mutationFn: () => post<{ url: string }>('/workspace/invites', { role: inviteRole }),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: keys.invites });
      setLink({ url: inv.url, note: `Anyone with this link can join as ${inviteRole === 'admin' ? 'an admin' : 'a member'} within 7 days.` });
    },
    onError
  });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/workspace/invites/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites }), onError });
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => patch(`/workspace/members/${userId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }),
    onError
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => del(`/workspace/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }),
    onError
  });
  const resetLink = useMutation({
    mutationFn: (userId: string) => post<{ url: string; expiresInHours: number }>(`/workspace/members/${userId}/reset-link`),
    onSuccess: (r) => setLink({ url: r.url, note: `Send this to the member. It lets them set a new password within ${r.expiresInHours} hours.` }),
    onError
  });

  return (
    <Card>
      <CardHeader
        icon={<Users className="h-4 w-4" />}
        title="Team"
        subtitle="Everyone here shares products, materials and suppliers."
        action={
          isAdmin && (
            <div className="flex gap-2">
              <Select aria-label="Invite role" className="w-28 py-1 text-xs" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
              <Button size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} loading={createInvite.isPending} onClick={() => createInvite.mutate()}>
                Invite link
              </Button>
            </div>
          )
        }
      />
      {members.isLoading ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {(members.data ?? []).map((m) => {
            const self = m.userId === me.user.id;
            const canManage = isAdmin && !self && (m.role !== 'owner' || me.workspace.role === 'owner');
            return (
              <li key={m.userId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {self && <span className="text-xs text-zinc-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">{m.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  {canManage ? (
                    <Select
                      aria-label={`Role for ${m.name}`}
                      className="w-28 py-1 text-xs"
                      value={m.role}
                      onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as Role })}
                    >
                      {me.workspace.role === 'owner' && <option value="owner">Owner</option>}
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </Select>
                  ) : (
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-800">{m.role}</span>
                  )}
                  {canManage && (
                    <>
                      <IconButton label={`Password reset link for ${m.name}`} onClick={() => resetLink.mutate(m.userId)}>
                        <KeyRound className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label={`Remove ${m.name}`}
                        className="hover:text-rose-600"
                        onClick={async () => {
                          if (await confirm({ title: `Remove ${m.name}?`, body: 'They lose access to this workspace immediately.', confirmLabel: 'Remove', danger: true }))
                            removeMember.mutate(m.userId);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {isAdmin && (invites.data?.length ?? 0) > 0 && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Open invite links</p>
          <ul className="space-y-1.5">
            {invites.data!.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <Link2 className="h-3.5 w-3.5" /> {i.role} · by {i.createdBy} · expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {link && <CopyLink url={link.url} note={link.note} onClose={() => setLink(null)} />}
    </Card>
  );
}

function Account() {
  const me = useSession();
  const qc = useQueryClient();
  const resetSession = useResetSession();
  const toast = useToast();
  const [name, setName] = useState(me.user.name);
  const [pw, setPw] = useState({ current: '', next: '' });
  const saveName = useMutation({
    mutationFn: () => patch<Me>('/auth/profile', { name }),
    onSuccess: (m) => {
      qc.setQueryData(keys.me, m);
      qc.invalidateQueries({ queryKey: keys.leaderboard });
      toast.success('Name updated');
    },
    onError: (e) => toast.error(e.message)
  });
  const changePw = useMutation({
    mutationFn: () => post('/auth/password', { currentPassword: pw.current, newPassword: pw.next }),
    onSuccess: () => {
      setPw({ current: '', next: '' });
      toast.success('Password changed. Other devices were signed out.');
    },
    onError: (e) => toast.error(e.message)
  });
  const logout = useMutation({ mutationFn: () => post('/auth/logout'), onSettled: () => resetSession(null) });
  return (
    <Card>
      <CardHeader
        title="Your account"
        subtitle={me.user.email}
        action={
          <Button size="sm" variant="secondary" icon={<LogOut className="h-3.5 w-3.5" />} loading={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
        }
      />
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveName.mutate();
          }}
        >
          <Field label="Display name" htmlFor="acc-name">
            <Input id="acc-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Button type="submit" variant="secondary" size="sm" loading={saveName.isPending} disabled={!name.trim() || name === me.user.name}>
            Save name
          </Button>
        </form>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            changePw.mutate();
          }}
        >
          <Field label="Current password" htmlFor="acc-cur">
            <Input id="acc-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="acc-new" hint="At least 10 characters, mixing letters with numbers or symbols.">
            <Input id="acc-new" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Button type="submit" variant="secondary" size="sm" loading={changePw.isPending} disabled={!pw.current || pw.next.length < 10}>
            Change password
          </Button>
        </form>
      </div>
    </Card>
  );
}

function PrivacyAndCookies() {
  const consent = getCookieConsent();
  const analyticsActive = consent?.analytics ?? false;

  return (
    <Card>
      <CardHeader
        icon={<Cookie className="h-4 w-4" />}
        title="Privacy & Cookies"
        subtitle="Manage how Solution Velocity stores cookies and measures usage on your device."
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<Cookie className="h-3.5 w-3.5" />}
            onClick={() => openCookiePreferences()}
          >
            Manage preferences
          </Button>
        }
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Essential Cookies
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              Active
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Authentication, session persistence, and CSRF protection. Cannot be disabled.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
              <Cookie className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Server Analytics
            </span>
            <span
              className={cx(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                analyticsActive
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
              )}
            >
              {analyticsActive ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Self-hosted page visits and usage telemetry to help improve features.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const me = useSession();
  const [params] = useSearchParams();
  const [appDirty, setAppDirty] = useState(false);
  const [dashboardDirty, setDashboardDirty] = useState(false);
  const confirm = useConfirm();
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (appDirty || dashboardDirty) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirm({ title: 'Discard unsaved layout changes?', body: 'Your unsaved changes will be lost if you leave this section.', confirmLabel: 'Discard changes' }).then((ok) => {
      if (!active) return;
      if (ok) blocker.proceed(); else blocker.reset();
    });
    return () => { active = false; };
  }, [blocker, confirm]);
  const isDashboard = params.get('section') === 'dashboard';
  const isLayout = params.get('section') === 'layout';
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your workspace, account and personal dashboard." />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 md:px-6">
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-zinc-800">
          <Link
            to="/settings"
            aria-current={!isDashboard && !isLayout ? 'page' : undefined}
            className={cx('rounded-md px-4 py-2 text-sm font-semibold', !isDashboard && !isLayout ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
          >
            Workspace & account
          </Link>
          <Link
            to="/settings?section=dashboard"
            aria-current={isDashboard ? 'page' : undefined}
            className={cx('rounded-md px-4 py-2 text-sm font-semibold', isDashboard ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
          >
            Dashboard personalization
          </Link>
          <Link
            to="/settings?section=layout"
            aria-current={isLayout ? 'page' : undefined}
            className={cx('rounded-md px-4 py-2 text-sm font-semibold', isLayout ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}
          >Layout</Link>
        </nav>
        {isDashboard ? (
          <DashboardSettings onDirtyChange={setDashboardDirty} />
        ) : isLayout ? (
          <>
            <AppLayoutSettings onDirtyChange={setAppDirty} />
            <details className="rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Advanced: arrange dashboard widgets</summary>
              <div className="border-t border-slate-200 p-4 dark:border-zinc-800"><DashboardSettings mode="layout" onDirtyChange={setDashboardDirty} /></div>
            </details>
          </>
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="font-semibold">Dashboard personalization</h2>
                  <p className="mt-1 text-sm text-zinc-500">Choose a template and arrange your dashboard widgets.</p>
                </div>
                <Link to="/settings?section=dashboard" className="inline-flex min-h-10 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-blue-400 dark:hover:bg-zinc-800">
                  Customize dashboard
                </Link>
              </div>
            </Card>
            {me.demo ? <Card><div className="p-4"><h2 className="font-semibold">Temporary demo workspace</h2><p className="mt-1 text-sm text-zinc-500">Account, workspace and team management are unavailable in the demo. Exit the demo to sign in or request access.</p></div></Card> : <>
              <WorkspaceAccess />
              <WorkspaceSettings />
              {me.workspace.mode === 'team' ? <Team /> : <Card><div className="p-4"><h2 className="font-semibold">Personal workspace</h2><p className="mt-1 text-sm text-zinc-500">Invitations are disabled here. Create a separate team workspace above to collaborate.</p></div></Card>}
              <Account />
            </>}
            <PrivacyAndCookies />
          </>
        )}
      </div>
    </>
  );
}
