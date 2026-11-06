import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, get, post } from '../api/client';
import { Button, Field, Input } from '../components/ui';
import { Logo } from './auth/Auth';
import { FounderCustomerDashboard } from './FounderCustomerDashboard';

type Stage = 'login' | 'enroll' | 'verify' | 'rotate' | 'authenticated' | 'recovery';
type Founder = { id: string; name: string; role: string };

/** This UI is only included in explicitly opted-in local test builds. */
export function FoundersExperimental() {
  const navigate = useNavigate();
  const location = useLocation();
  // Navigation state is only a UI hint. Every subsequent action is still
  // authorized against the server's short-lived founder challenge/session.
  const [initialStep] = useState<'enroll' | 'verify' | null>(() => {
    const step = (location.state as { founderStep?: unknown } | null)?.founderStep;
    return step === 'enroll' || step === 'verify' ? step : null;
  });
  const [stage, setStage] = useState<Stage>(() => window.location.pathname === '/founders/recovery' ? 'recovery' : initialStep ?? 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [founder, setFounder] = useState<Founder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const data = await get<{ founder: Founder }>('/founders/me');
        if (active) { setFounder(data.founder); setStage('authenticated'); }
      } catch {
        // An enroll hint from the normal login still needs the server-side
        // password challenge; arbitrary navigation state cannot create one.
        if (initialStep === 'enroll') {
          try {
            const data = await post<{ secret: string; uri: string }>('/founders/mfa/setup', {});
            if (active) setSetup(data);
          } catch {
            if (active) { setStage('login'); setError('Authentication could not be completed. Please try again.'); }
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [initialStep]);

  function change(next: Stage) {
    setStage(next); setError('');
    const paths: Record<Stage, string> = { login: '/founders/login', enroll: '/founders/mfa-setup', verify: '/founders/mfa-verify', rotate: '/founders/password-rotation', authenticated: '/founders', recovery: '/founders/recovery' };
    navigate(paths[next], { replace: true });
  }
  async function run(action: () => Promise<void>) {
    setError(''); setBusy(true);
    try { await action(); } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Please wait and try again.' : 'Authentication could not be completed. Please try again.');
    } finally { setBusy(false); }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await post<{ step: 'enroll' | 'verify' }>('/founders/login', { email, password });
      setPassword('');
      if (result.step === 'enroll') setSetup(await post('/founders/mfa/setup', {}));
      change(result.step);
    });
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await post<{ step: 'rotate' | 'authenticated'; recoveryCodes?: string[] }>('/founders/mfa/verify', { code });
      setCode(''); setSetup(null);
      if (result.step === 'rotate') { setRecoveryCodes(result.recoveryCodes ?? []); change('rotate'); }
      else { setFounder((await get<{ founder: Founder }>('/founders/me')).founder); change('authenticated'); }
    });
  }
  async function rotate(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) { setError('The passwords do not match.'); return; }
    await run(async () => {
      await post('/founders/password/rotate', { password: newPassword });
      setNewPassword(''); setConfirmation(''); setRecoveryCodes([]);
      setFounder((await get<{ founder: Founder }>('/founders/me')).founder); change('authenticated');
    });
  }
  async function logout() {
    await run(async () => { await post('/founders/logout', {}); setFounder(null); setRecoveryCodes([]); change('login'); });
  }

  return <main className="min-h-screen bg-white px-4 py-12 dark:bg-zinc-950 sm:px-12">
    <div className={`mx-auto space-y-6 ${stage === 'authenticated' && import.meta.env.VITE_FOUNDER_MANAGEMENT_EXPERIMENTAL === 'true' ? 'max-w-5xl' : 'max-w-sm'}`}><Logo />
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Experimental local test only</p>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{stage === 'authenticated' ? 'Founder authentication' : stage === 'recovery' ? 'Account recovery' : stage === 'rotate' ? 'Change temporary password' : stage === 'enroll' ? 'Set up your authenticator' : stage === 'verify' ? 'Verify your identity' : 'Founders sign in'}</h1>
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {loading ? <p>Checking session…</p> : stage === 'login' ? <form onSubmit={login} className="space-y-4">
        <Field label="Founder email" htmlFor="founder-email"><Input id="founder-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="founder-password"><Input id="founder-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <Button type="submit" loading={busy}>Sign in</Button>
        <button type="button" onClick={() => change('recovery')} className="block text-sm text-blue-700 underline">Need account recovery?</button>
      </form> : stage === 'recovery' ? <div className="space-y-4"><p className="text-sm">Password recovery is not available. Do not use this experimental flow for real accounts.</p><Button variant="secondary" onClick={() => change('login')}>Back to sign in</Button></div>
      : stage === 'authenticated' ? <div className="space-y-4"><div className="flex items-center justify-between gap-4"><p>Signed in as {founder?.name}.</p><Button variant="secondary" onClick={logout} loading={busy}>Sign out</Button></div>{import.meta.env.VITE_FOUNDER_MANAGEMENT_EXPERIMENTAL === 'true' ? <FounderCustomerDashboard /> : <p>No management features are enabled.</p>}</div>
      : stage === 'rotate' ? <form onSubmit={rotate} className="space-y-4">
        {recoveryCodes.length > 0 && <div className="space-y-2 rounded-md border border-amber-300 p-3 text-sm"><p>Save these single-use recovery codes securely. They will not be shown again.</p><ul className="break-all font-mono text-xs">{recoveryCodes.map(c => <li key={c}>{c}</li>)}</ul><label className="flex gap-2"><input type="checkbox" checked={savedCodes} onChange={e => setSavedCodes(e.target.checked)} /> I saved my recovery codes</label></div>}
        <Field label="New password" htmlFor="founder-new-password" hint="At least 14 characters, with letters and numbers or symbols."><Input id="founder-new-password" type="password" minLength={14} maxLength={200} required autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></Field>
        <Field label="Confirm new password" htmlFor="founder-confirm"><Input id="founder-confirm" type="password" required autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field>
        <Button type="submit" loading={busy} disabled={recoveryCodes.length > 0 && !savedCodes}>Change password</Button>
      </form> : <form onSubmit={verify} className="space-y-4">
        {stage === 'enroll' && setup && <div className="space-y-2 text-sm"><p>Enter this setup key in your authenticator app. Keep it private.</p><code className="block break-all rounded-md bg-slate-100 p-3">{setup.secret}</code></div>}
        <Field label="Authenticator code or recovery code" htmlFor="founder-mfa"><Input id="founder-mfa" required autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></Field>
        <Button type="submit" loading={busy}>Verify</Button>
      </form>}
    </div>
  </main>;
}
