import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderKanban,
  FlaskConical,
  Gauge,
  Layers3,
  LockKeyhole,
  Package,
  Handshake,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { ApiError, get, post } from '../api/client';
import { Button, Card, cx } from '../components/ui';

const demoTabs = ['Overview', 'Products', 'Projects', 'Contributions'] as const;
type DemoTab = (typeof demoTabs)[number];

interface DemoSnapshot {
  workspaceName: string;
  metrics: { label: string; value: string; note: string; icon: 'products' | 'projects' | 'issues' | 'health' }[];
  products: { name: string; category: string; stage: string; completion: number; health: string; color: string }[];
  issues: { key: string; title: string; type: string; priority: string; status: string; owner: string }[];
  contributions: { name: string; category: string; score: number; dimensions: string }[];
  activity: { name: string; action: string; when: string }[];
}

const metricIcons = { products: Package, projects: FolderKanban, issues: CheckCircle2, health: Gauge } as const;

function Metric({ label, value, note, icon }: DemoSnapshot['metrics'][number]) {
  const Icon = metricIcons[icon];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{note}</p>
        </div>
        <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-4 w-4" /></span>
      </div>
    </Card>
  );
}

function ProductRows({ products }: Pick<DemoSnapshot, 'products'>) {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {products.map((product) => (
        <div key={product.name} className="grid gap-3 px-4 py-4 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:items-center">
          <div className="flex items-center gap-3">
            <span className={cx('h-9 w-9 rounded-lg', product.color)} />
            <div><p className="font-medium">{product.name}</p><p className="text-xs text-zinc-500">{product.category}</p></div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{product.stage}</p>
          <div><div className="flex justify-between text-xs"><span>Progress</span><span>{product.completion}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className={cx('h-full rounded-full', product.color)} style={{ width: `${product.completion}%` }} /></div></div>
          <span className={cx('w-fit rounded-full px-2.5 py-1 text-xs', product.health === 'On track' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300')}>{product.health}</span>
        </div>
      ))}
    </div>
  );
}

function ProjectRows({ issues }: Pick<DemoSnapshot, 'issues'>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/70">
          <tr>{['Issue', 'Type / priority', 'Status', 'Assignee'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {issues.map((issue) => (
            <tr key={issue.key}>
              <td className="px-4 py-3"><span className="font-mono text-xs text-indigo-600 dark:text-indigo-300">{issue.key}</span><p className="mt-0.5 font-medium">{issue.title}</p></td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{issue.type} · <span className={issue.priority === 'Critical' ? 'text-rose-600' : ''}>{issue.priority}</span></td>
              <td className="px-4 py-3">{issue.status}</td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{issue.owner}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributionRows({ contributions }: Pick<DemoSnapshot, 'contributions'>) {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {contributions.map((contribution) => (
        <div key={contribution.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div><p className="font-medium">{contribution.name}</p><p className="mt-1 text-xs text-zinc-500">{contribution.category} · {contribution.dimensions}</p></div>
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{contribution.score} sample XP</span>
        </div>
      ))}
      <p className="px-4 py-3 text-xs text-zinc-500">Illustrative records only. Demo data is not connected to employee accounts or production workspaces.</p>
    </div>
  );
}

export function ProductDemoPage() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<DemoTab>('Overview');
  const [demoData, setDemoData] = useState<DemoSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const remaining = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const active = expiresAt !== null && remaining > 0 && demoData !== null;

  useEffect(() => {
    const title = document.title;
    const meta = [
      ['name', 'description'],
      ['property', 'og:title'],
      ['property', 'og:description']
    ].map(([attribute, value]) => ({
      element: document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`),
      content: document.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`)?.content ?? ''
    }));
    document.title = 'Solution Velocity | Product Demo';
    const description = 'Explore the Solution Velocity product and project delivery workspace in a time-limited demo with fictional sample data.';
    meta[0].element?.setAttribute('content', description);
    meta[1].element?.setAttribute('content', 'Solution Velocity | Product Demo');
    meta[2].element?.setAttribute('content', description);
    return () => {
      document.title = title;
      for (const item of meta) if (item.element) item.element.content = item.content;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (expiresAt !== null && remaining === 0) setDemoData(null);
  }, [expiresAt, remaining]);

  const startDemo = async () => {
    setBusy(true);
    setError('');
    try {
      const access = await post<{ expiresAt: string }>('/demo/access', {});
      const data = await get<DemoSnapshot>('/demo/data');
      setExpiresAt(new Date(access.expiresAt).getTime());
      setDemoData(data);
      setNow(Date.now());
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 410) {
        setBlocked(true);
        setError(reason.message || 'This network has already used its one-time demo access.');
      } else {
        setError(reason instanceof Error ? reason.message : 'The demo could not be started.');
      }
    } finally {
      setBusy(false);
    }
  };

  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><Layers3 className="h-4 w-4" /></span>Solution Velocity</a>
          <div className="flex items-center gap-3">
            {active && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><Clock3 className="h-3.5 w-3.5" />{minutes}:{seconds} left</span>}
            <a href="/login" className="text-sm font-medium text-zinc-600 hover:text-indigo-600 dark:text-zinc-300">Sign in <ArrowUpRight className="inline h-3.5 w-3.5" /></a>
          </div>
        </div>
      </header>

      {!active ? (
        <section className="mx-auto grid min-h-[calc(100vh-65px)] max-w-5xl content-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_0.9fr] md:items-center sm:px-6">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"><Sparkles className="h-3.5 w-3.5" />Interactive product preview</p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">See product work come together.</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">Explore a guided workspace with sample products, delivery issues, project progress, and explainable contribution records.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button loading={busy} disabled={blocked || (expiresAt !== null && remaining === 0)} icon={<FlaskConical className="h-4 w-4" />} onClick={() => void startDemo()}>{blocked ? 'Demo access used' : expiresAt ? 'Demo ended' : 'Start 15-minute demo'}</Button>
              <a href="/signup" className="inline-flex items-center rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900">Create a workspace</a>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {remaining === 0 && expiresAt !== null && <p role="status" className="mt-4 text-sm text-zinc-500">The 15-minute preview has ended. This network cannot start another demo.</p>}
            <p className="mt-6 max-w-xl text-xs leading-5 text-zinc-500">One demo per public IP address. To enforce this limit, we store a keyed hash of your IP address—not the address itself. People sharing a network share the one-time access, and the hash is retained to prevent repeat demos.</p>
          </div>
          <Card className="overflow-hidden p-5 shadow-xl shadow-indigo-950/5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-medium text-zinc-500">One connected workspace</p><p className="mt-1 font-semibold">Product to delivery, in context</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">Solution Velocity</span></div>
            <div className="mt-5 space-y-3">
              {[['01', 'Shape products', 'Capture product details, materials, and costs.'], ['02', 'Coordinate delivery', 'Connect project issues to product work.'], ['03', 'Learn from outcomes', 'Review cost insights and meaningful contribution evidence.']].map(([step, title, detail]) => <div key={step} className="flex gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900"><span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300">{step}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p></div></div>)}
            </div>
            <p className="mt-4 text-xs text-zinc-500">Start the timed demo to load fictional example records.</p>
          </Card>
        </section>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Solution Velocity · interactive demo</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{demoData?.workspaceName}</h1><p className="mt-1 text-sm text-zinc-500">Fictional example workspace · no account data</p></div>
            <div className="flex items-center gap-2 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Read-only demo · resets when access ends</div>
          </div>
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800" aria-label="Demo sections">
            {demoTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={cx('whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors', tab === item ? 'border-indigo-600 text-indigo-600 dark:text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200')}>{item}</button>)}
          </nav>
          {tab === 'Overview' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {demoData?.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
              </div>
              <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
                <Card><div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"><div><h2 className="font-semibold">Product portfolio</h2><p className="text-xs text-zinc-500">Example stage and health overview</p></div><BarChart3 className="h-4 w-4 text-zinc-400" /></div><ProductRows products={demoData?.products ?? []} /></Card>
                <Card className="p-4"><h2 className="font-semibold">Recent activity</h2><div className="mt-4 space-y-4">{demoData?.activity.map(({ name, action, when }) => <div key={action} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" /><div><p className="text-sm"><span className="font-medium">{name}</span> {action}</p><p className="mt-1 text-xs text-zinc-500">{when}</p></div></div>)}</div></Card>
              </div>
              <Card className="p-4"><div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-indigo-600" /><p className="text-sm font-medium">Demo data notice</p></div><p className="mt-1 text-sm text-zinc-500">All names, projects, product figures, issues, and contribution scores in this preview are fictional examples.</p></Card>
            </div>
          )}
          {tab === 'Products' && <Card><div className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Product pipeline</h2><p className="mt-1 text-sm text-zinc-500">Track development stages, readiness, and delivery health.</p></div><ProductRows products={demoData?.products ?? []} /></Card>}
          {tab === 'Projects' && <Card><div className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">AeroBottle delivery</h2><p className="mt-1 text-sm text-zinc-500">Sample project issues and work ownership.</p></div><ProjectRows issues={demoData?.issues ?? []} /></Card>}
          {tab === 'Contributions' && <Card><div className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800"><h2 className="font-semibold">Reviewed contributions</h2><p className="mt-1 text-sm text-zinc-500">Example outcomes scored across impact, quality, complexity, collaboration, and effort.</p></div><ContributionRows contributions={demoData?.contributions ?? []} /></Card>}
          <p className="mt-5 text-center text-xs text-zinc-500">Mock data for product evaluation only · no changes are saved · {minutes}:{seconds} remaining</p>
        </div>
      )}

      <section className="border-t border-zinc-200 bg-white py-14 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Built for product teams</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">A clear view from product idea to delivery.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Solution Velocity brings product records, project issues, materials and costs, and reviewed contribution evidence into one workspace.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-indigo-600" /><h3 className="font-semibold">Security and data handling</h3></div>
              <ul className="mt-4 space-y-3 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                <li><strong className="text-zinc-900 dark:text-zinc-100">Demo access:</strong> an HMAC-SHA-256 fingerprint, not the raw IP, is kept to enforce one demo per network. It is retained for that purpose.</li>
                <li><strong className="text-zinc-900 dark:text-zinc-100">Timed session:</strong> a random token is stored as a hash; the browser cookie is HTTP-only, SameSite Strict, and expires after 15 minutes.</li>
                <li><strong className="text-zinc-900 dark:text-zinc-100">Account security:</strong> passwords use scrypt hashing; workspace membership is checked on authenticated API requests.</li>
                <li>If you later create an account, standard account sessions also record IP address and user-agent for session handling. No independent security certification is claimed.</li>
              </ul>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /><h3 className="font-semibold">Pricing and evaluation</h3></div>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Public plan prices and tiers have not been published. We will not quote invented rates here; request access to discuss your team size, deployment needs, and evaluation scope.</p>
              <a href="/request-access" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">Request access <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2"><Handshake className="h-4 w-4 text-indigo-600" /><h3 className="font-semibold">Integrations</h3></div>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Available product areas include product planning, projects and issues, materials and supplier costs, and reviewed contribution records.</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">GitHub, Jira, and other external services are not currently integrated. Demo activity is fictional and no external events are imported.</p>
            </Card>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Frequently asked questions</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">The practical details.</h2>
            </div>
            <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {[
                ['Is the demo connected to real customer data?', 'No. The preview loads fictional sample products, projects, issues, people, and contribution scores. It does not read or modify a customer workspace.'],
                ['Why can I only start it once?', 'Access is limited to one 15-minute demo per public IP address. Networks with a shared public IP share that access; a changed IP may be treated as a different network.'],
                ['What do you retain for the demo limit?', 'The demo access ledger retains a keyed HMAC fingerprint of the network IP, a hash of the temporary access token, and creation/expiry timestamps. Demo requests omit the IP from application request logs. Network or hosting-provider logs may have their own retention policies.'],
                ['Can I change demo records or export them?', 'No. This is a read-only walkthrough with preset examples and no saved changes or data export.'],
                ['Does it connect to GitHub or Jira?', 'No. Those external integrations are not available in this build. The examples do not represent imported or verified third-party activity.'],
                ['How is Contribution XP calculated?', 'The product records reviewed contribution outcomes separately from legacy Activity XP. The demo scores are illustrative; real contributions require evidence and an authorized review.'],
                ['What does Solution Velocity cost?', 'Public pricing has not been published. Request access to discuss requirements; no price or plan is implied by this demo.']
              ].map(([question, answer]) => (
                <details key={question} className="group py-4">
                  <summary className="cursor-pointer list-none pr-6 text-sm font-medium marker:hidden">{question}<span className="float-right text-zinc-400 transition-transform group-open:rotate-45">+</span></summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{answer}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <div><p className="font-semibold">Want to evaluate Solution Velocity with your team?</p><p className="mt-1 text-sm text-zinc-500">Request access to discuss a real workspace and rollout requirements.</p></div>
            <a href="/request-access" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Request access <ArrowUpRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>
    </main>
  );
}
