import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, Gauge, Lightbulb, LineChart, Rocket } from 'lucide-react';
import { CURRENCIES, type Me } from '@sv/shared';
import { ApiError, get, post } from '../../api/client';
import { useMe, useResetSession } from '../../api/hooks';
import { Button, Field, Input, Select, Spinner } from '../../components/ui';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-500/30">
        <Gauge className="h-4.5 w-4.5" />
      </div>
      <span className="font-semibold tracking-tight">Solution Velocity</span>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10" />
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-900 lg:flex lg:flex-col lg:justify-center lg:px-16 dark:bg-zinc-900/60">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative max-w-md text-white">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Plan, track and improve your products, one level at a time.</h2>
          <div className="mt-10 space-y-6">
            {[
              { icon: Lightbulb, title: 'Tell us', body: 'Answer quick questions about your product and earn XP as the picture comes together.' },
              { icon: LineChart, title: 'Track it', body: 'See exactly where your money goes and how much you keep on every sale.' },
              { icon: Rocket, title: 'Improve it', body: 'Get smart suggestions, such as a cheaper supplier or a better price, and level up each product.' }
            ].map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Step {i + 1}</p>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  );
}

function useSignedIn() {
  const reset = useResetSession();
  return (me: Me) => reset(me);
}

function AuthForm({ mode, inviteToken }: { mode: 'login' | 'register'; inviteToken?: string }) {
  const [params] = useSearchParams();
  const signedIn = useSignedIn();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '', currency: 'USD' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const cfg = useQuery({ queryKey: ['auth-config'], queryFn: () => get<{ allowSignup: boolean }>('/auth/config'), enabled: mode === 'register' && !inviteToken });

  const submit = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? post<Me>('/auth/login', { email: form.email, password: form.password })
        : post<Me>('/auth/register', {
            name: form.name,
            email: form.email,
            password: form.password,
            ...(inviteToken ? { inviteToken } : { workspaceName: form.workspaceName || undefined, currency: form.currency })
          }),
    onSuccess: signedIn
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  const next = params.get('next');
  const signupClosed = mode === 'register' && !inviteToken && cfg.data && !cfg.data.allowSignup;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : inviteToken ? 'Create your account' : 'Start your workspace'}</h1>
      <p className="mt-1.5 text-sm text-zinc-500">
        {mode === 'login' ? 'Sign in to keep your products moving.' : 'It takes 30 seconds. No credit card, no catch.'}
      </p>

      {signupClosed ? (
        <div className="mt-8 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          Sign-up is invite-only on this server. Ask your admin for an invite link.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {mode === 'register' && (
            <Field label="Your name" htmlFor="name">
              <Input id="name" autoComplete="name" required value={form.name} onChange={set('name')} placeholder="Maya Patel" />
            </Field>
          )}
          <Field label="Work email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
          </Field>
          <Field label="Password" htmlFor="password" hint={mode === 'register' ? 'At least 10 characters, mixing letters with numbers or symbols.' : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 10 : 1}
              value={form.password}
              onChange={set('password')}
            />
          </Field>
          {mode === 'register' && !inviteToken && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Workspace name" htmlFor="ws">
                <Input id="ws" value={form.workspaceName} onChange={set('workspaceName')} placeholder="Acme Products" />
              </Field>
              <Field label="Currency" htmlFor="cur">
                <Select id="cur" value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <ErrorText error={submit.error} />
          <Button type="submit" className="w-full" loading={submit.isPending}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      )}

      {!inviteToken && (
        <p className="mt-6 text-center text-sm text-zinc-500">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
                Sign in
              </Link>
            </>
          )}
        </p>
      )}
      {mode === 'login' && <p className="mt-3 text-center text-xs text-zinc-400">Forgot your password? Ask a workspace admin for a reset link.</p>}
    </>
  );
}

const withShell = (node: ReactNode) => <Shell>{node}</Shell>;

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  return withShell(<AuthForm mode={mode} />);
}

export function JoinPage() {
  const { token = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => get<{ workspaceName: string; role: string }>(`/auth/invite/${token}`),
    retry: false
  });
  const accept = useMutation({
    mutationFn: () => post<Me>('/auth/accept-invite', { token }),
    onSuccess: (m) => {
      signedIn(m);
      navigate('/');
    }
  });

  if (invite.isLoading || me.isLoading) return withShell(<Spinner />);
  if (invite.error) {
    return withShell(
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Invite not valid</h1>
        <p className="mt-2 text-sm text-zinc-500">{(invite.error as ApiError).message}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Go to sign in →
        </Link>
      </>
    );
  }
  const ws = invite.data!.workspaceName;

  if (me.data) {
    return withShell(
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Join {ws}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          You are signed in as {me.data.user.email}. Join <strong>{ws}</strong> as a {invite.data!.role}?
        </p>
        <ErrorText error={accept.error} />
        <div className="mt-6 flex gap-2">
          <Button onClick={() => accept.mutate()} loading={accept.isPending} icon={<CheckCircle2 className="h-4 w-4" />}>
            Join workspace
          </Button>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Not now
          </Button>
        </div>
      </>
    );
  }

  return withShell(
    <>
      <div className="mb-6 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
        You’ve been invited to join <strong>{ws}</strong>.
      </div>
      <AuthForm mode="register" inviteToken={token} />
      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
          Sign in to join
        </Link>
      </p>
    </>
  );
}

export function ResetPage() {
  const { token = '' } = useParams();
  const signedIn = useSignedIn();
  const [password, setPassword] = useState('');
  const info = useQuery({ queryKey: ['reset', token], queryFn: () => get<{ email: string }>(`/auth/reset/${token}`), retry: false });
  const submit = useMutation({ mutationFn: () => post<Me | undefined>('/auth/reset', { token, newPassword: password }), onSuccess: (m) => m && signedIn(m) });

  if (info.isLoading) return withShell(<Spinner />);
  if (info.error) {
    return withShell(
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-zinc-500">{(info.error as Error).message}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Go to sign in →
        </Link>
      </>
    );
  }
  return withShell(
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-zinc-500">For {info.data!.email}. You’ll be signed out everywhere else.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="New password" htmlFor="np" hint="At least 10 characters, mixing letters with numbers or symbols.">
          <Input id="np" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={submit.error} />
        <Button type="submit" className="w-full" loading={submit.isPending}>
          Set password and sign in
        </Button>
      </form>
    </>
  );
}
