import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Boxes, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { get } from '../api/client';
import { useMe } from '../api/hooks';
import { Button, Spinner } from '../components/ui';

const primaryLink = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#164e82] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#103d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const secondaryLink = 'inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700';

export function TryDemoPage() {
  const session = useMe();
  const config = useQuery({ queryKey: ['auth-config'], queryFn: () => get<{ allowSignup: boolean }>('/auth/config'), enabled: !session.isLoading && !session.data });

  return (
    <main className="min-h-full bg-[#f4f7fa] px-5 py-10 text-slate-900 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#31577d] hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <div className="mt-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Boxes className="h-6 w-6" /></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-blue-700">Product demo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#102f55] sm:text-4xl">Explore a sample workspace</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">Try the real application with example products, materials and suppliers. An account is required.</p>
          <ol className="mt-6 space-y-4 border-t border-slate-100 pt-6 text-sm text-slate-600">
            <li><strong className="text-slate-900">1. Start with a workspace.</strong> Create an account, or sign in and create a separate personal workspace in Settings.</li>
            <li><strong className="text-slate-900">2. Load the examples.</strong> After sign-up, choose “Load sample workspace”. In an existing empty workspace, choose “Load sample products” on the dashboard.</li>
            <li><strong className="text-slate-900">3. Explore.</strong> Open the products, materials and suppliers to see how they work together.</li>
          </ol>
          <div className="mt-6 flex gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" /><p>Sample records are saved in the workspace where you load them and are visible to its members and system administrators. Use a separate personal workspace if you do not want to add them to a shared workspace. Samples are available only when the product list is empty and are not removed automatically.</p></div>
          <div className="mt-7 flex flex-wrap gap-3">
            {session.isLoading ? <Spinner label="Checking your account" /> : session.data ? <>
              <Link to="/settings" className={primaryLink}>Create a separate workspace <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/" className={secondaryLink}>Go to dashboard</Link>
            </> : config.isLoading ? <Spinner label="Checking access" /> : config.isError || session.isError ? <>
              <p role="alert" className="w-full text-sm text-rose-700">We couldn’t check account access. Please try again.</p>
              <Button variant="secondary" onClick={() => { void session.refetch(); void config.refetch(); }}>Try again</Button>
              <Link to="/request-access" className={secondaryLink}>Request access</Link>
            </> : <>
              {config.data?.allowSignup ? <Link to="/signup?demo=1" className={primaryLink}>Create an account <ArrowRight className="h-4 w-4" /></Link> : <Link to="/request-access" className={primaryLink}>Request access <ArrowRight className="h-4 w-4" /></Link>}
              <Link to="/login?next=%2Ftry-demo" className={secondaryLink}>Sign in</Link>
              {!config.data?.allowSignup && <p className="w-full text-xs text-slate-500">New accounts currently require an invitation. Request access or sign in with an existing account.</p>}
            </>}
          </div>
        </div>
      </div>
    </main>
  );
}
