import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, get, patch, post } from '../api/client';
import { Button, Field, Input, Select } from '../components/ui';

type Customer = { id: string; name: string; email: string; is_disabled: boolean; is_admin: boolean };
type Workspace = { id: string; name: string; mode: 'solo' | 'team'; member_count: number };

/** Local-only, opt-in management slice; never represents production readiness. */
export function FounderCustomerDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState(''); const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [setupUrl, setSetupUrl] = useState(''); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true); const [available, setAvailable] = useState(false); const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const [users, spaces] = await Promise.all([get<{ items: Customer[]; canManage: boolean }>('/founders/customers'), get<{ items: Workspace[] }>('/founders/organizations')]);
    setCustomers(users.items); setCanManage(users.canManage); setWorkspaces(spaces.items); setAvailable(true);
  }, []);
  useEffect(() => { refresh().catch(() => setError('Customer management is not available in this environment.')).finally(() => setLoading(false)); }, [refresh]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSetupUrl('');
    try {
      const result = await post<{ setupUrl: string }>('/founders/customers', { name, email, workspaceName, mode });
      setSetupUrl(result.setupUrl); setName(''); setEmail(''); setWorkspaceName('');
      try { await refresh(); } catch { setError('Account created, but the customer list could not be refreshed. Save the setup link before leaving this page.'); }
    } catch (e) { setError(e instanceof ApiError && e.status === 409 ? 'An account with that email already exists.' : 'Could not create the account. Please try again.'); }
    finally { setBusy(false); }
  }
  async function setDisabled(user: Customer, disabled: boolean) {
    if (!window.confirm(`${disabled ? 'Suspend' : 'Reactivate'} ${user.name}?${disabled ? ' Their current sessions will be signed out.' : ''}`)) return;
    setBusy(true); setError('');
    try { await patch(`/founders/customers/${user.id}/status`, { disabled }); await refresh(); }
    catch { setError('Could not update the account. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 space-y-8 text-sm">
    <div><h2 className="text-xl font-semibold">Customer management</h2><p className="mt-1 text-slate-600 dark:text-zinc-300">Local test only. Showing up to the 100 most recent customers and workspaces; this is not a complete platform console.</p></div>
    {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-rose-700">{error}</p>}
    {loading ? <p>Loading customer data…</p> : available ? <>
      {canManage && <section className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-zinc-700"><h3 className="text-lg font-semibold">Create a customer account</h3>
        <p className="text-slate-600 dark:text-zinc-300">Create an individual account or the first owner of an organization. The person chooses their own password using a one-time setup link; email is not sent automatically.</p>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="customer-name"><Input id="customer-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></Field>
          <Field label="Customer email" htmlFor="customer-email"><Input id="customer-email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required /></Field>
          <Field label="Account type" htmlFor="customer-mode"><Select id="customer-mode" value={mode} onChange={e => setMode(e.target.value as 'solo' | 'team')}><option value="solo">Individual</option><option value="team">Organization</option></Select></Field>
          <Field label={mode === 'team' ? 'Organization name' : 'Personal workspace name'} htmlFor="customer-workspace"><Input id="customer-workspace" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} maxLength={80} required /></Field>
          <div className="sm:col-span-2"><Button type="submit" loading={busy}>Create account</Button></div>
        </form>
        {setupUrl && <div role="status" className="space-y-2 rounded-md bg-amber-50 p-3 text-amber-950"><p>Account created. Share this link securely with the customer; it expires in one hour and is shown only now. No email was sent.</p><label htmlFor="customer-setup-link" className="font-semibold">One-time setup link</label><Input id="customer-setup-link" readOnly value={setupUrl} onFocus={e => e.currentTarget.select()} /><Button variant="secondary" onClick={() => setSetupUrl('')}>I saved the link</Button></div>}
      </section>}
      <section className="space-y-3"><h3 className="text-lg font-semibold">Customers</h3>{customers.length === 0 ? <p>No customer accounts found.</p> : <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-zinc-700 dark:border-zinc-700">{customers.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-semibold">{user.name}</p><p className="break-all text-slate-600 dark:text-zinc-300">{user.email}</p><p className="text-xs">{user.is_disabled ? 'Suspended' : 'Active'}{user.is_admin ? ' · System administrator' : ''}</p></div>{canManage && !user.is_admin && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDisabled(user, !user.is_disabled)}>{user.is_disabled ? 'Reactivate' : 'Suspend'}</Button>}</li>)}</ul>}</section>
      <section className="space-y-3"><h3 className="text-lg font-semibold">Organizations and personal workspaces</h3>{workspaces.length === 0 ? <p>No workspaces found.</p> : <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-zinc-700 dark:border-zinc-700">{workspaces.map(w => <li key={w.id} className="flex items-center justify-between gap-3 p-3"><span className="font-semibold">{w.name}</span><span>{w.mode === 'team' ? 'Organization' : 'Individual'} · {w.member_count} {w.member_count === 1 ? 'member' : 'members'}</span></li>)}</ul>}</section>
    </> : null}
  </div>;
}
