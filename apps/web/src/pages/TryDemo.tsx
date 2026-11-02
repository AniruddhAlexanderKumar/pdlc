import { useEffect, useState } from 'react';
import type { Me } from '@sv/shared';
import { Link, Navigate } from 'react-router';
import { post } from '../api/client';
import { useMe, useResetSession } from '../api/hooks';
import { Button, Spinner } from '../components/ui';

// Share the in-flight request across React strict-mode remounts.
let startingDemo: Promise<Me> | null = null;
function startDemo() {
  if (!startingDemo) {
    startingDemo = post<Me>('/auth/demo').finally(() => { startingDemo = null; });
  }
  return startingDemo;
}

export function TryDemoPage() {
  const session = useMe();
  const resetSession = useResetSession();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (session.isLoading || session.isError || session.data || error) return;
    let active = true;
    void startDemo().then((me) => { if (active) resetSession(me); }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [session.isLoading, session.isError, session.data, error, attempt]);

  if (session.data?.demo) return <Navigate to="/" replace />;
  if (session.data) return <main className="mx-auto max-w-xl px-5 py-16 text-slate-900"><h1 className="text-2xl font-semibold">You’re already signed in</h1><p className="mt-3 text-sm leading-6 text-slate-600">A guest demo uses a separate temporary session. To protect your current session, sign out before opening it.</p><div className="mt-6 flex flex-wrap gap-3"><Link to="/" className="rounded-md bg-[#164e82] px-5 py-3 text-sm font-semibold text-white">Back to your workspace</Link></div></main>;
  const message = session.isError ? 'We couldn’t check your session. Please try again.' : error;
  return <main className="flex min-h-full items-center justify-center bg-[#f4f7fa] px-5 py-16 text-slate-900"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
    {message ? <><h1 className="text-xl font-semibold">Unable to open the demo</h1><p role="alert" className="mt-3 text-sm leading-6 text-slate-600">{message}</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button onClick={() => { setError(''); setAttempt((n) => n + 1); if (session.isError) void session.refetch(); }}>Try again</Button><Link to="/" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to home</Link></div></> : <><Spinner label="Preparing your sample workspace" /><h1 className="mt-4 text-xl font-semibold">Preparing your sample workspace</h1><p className="mt-2 text-sm text-slate-600">Your separate demo workspace will be ready in a moment.</p></>}
  </div></main>;
}
