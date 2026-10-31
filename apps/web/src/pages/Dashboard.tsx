import { ArrowRight, Boxes, ClipboardList, Mic, Plus, Settings2, Wand2 } from 'lucide-react';
import { Link } from 'react-router';
import { PHASES, PRESETS, type DashboardSpan } from '@sv/shared';
import { useDashboardLayout, useLoadSamples, useSession, useSaveDashboardLayout, useWorkspaceData } from '../api/hooks';
import { useNewProduct, useVoiceDictation } from '../components/Layout';
import { DashboardModelProvider } from '../components/dashboard/model';
import { DashboardDensity } from '../components/dashboard/density';
import { WIDGET_COMPONENTS } from '../components/dashboard/widgets';
import { Button, Card, Spinner, useConfirm } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Onboarding() {
  const me = useSession();
  const openNew = useNewProduct();
  const openVoice = useVoiceDictation();
  const samples = useLoadSamples();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">{me.workspace.name} / Overview</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">{greeting()}, {me.user.name.split(' ')[0]}</h1><p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Your workspace is ready. Start with a product or explore your projects.</p></div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>New product</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-slate-100 px-6 py-6 dark:border-zinc-800"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400"><Boxes className="h-4 w-4" /> Product workspace</div><h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Start with your first product</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-zinc-400">Capture the idea, track materials and costs, and keep the next steps together as your product develops.</p><div className="mt-6 flex flex-wrap gap-2"><Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Create a product</Button><Button variant="secondary" icon={<Mic className="h-4 w-4" />} onClick={openVoice}>Use voice capture</Button></div></div>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800">{PHASES.map((phase, i) => <div key={phase.id} className="p-5"><p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">0{i + 1} / {phase.label}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-zinc-400">{phase.blurb}</p></div>)}</div>
        </section>
        <div className="space-y-4"><Card className="p-6"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"><ClipboardList className="h-5 w-5" /></div><h2 className="mt-4 font-semibold text-slate-900 dark:text-white">Coordinate project work</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-zinc-400">Organize issues and follow the connections between work and people.</p><Link to="/projects" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-400">View projects <ArrowRight className="h-4 w-4" /></Link></Card>
          <Card className="p-6"><h2 className="font-semibold text-slate-900 dark:text-white">Take a look around</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-zinc-400">Explore an example workspace with sample products. Available while your product list is empty.</p><Button className="mt-4" variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={samples.isPending} onClick={() => samples.mutate()}>Load sample products</Button></Card></div>
      </div>
    </div>
  );
}

// Full class names so Tailwind can see them.
const DESKTOP_SPAN: Record<DashboardSpan, string> = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12'
};

export function DashboardPage() {
  const me = useSession();
  const { data, isLoading, isError, refetch } = useWorkspaceData();
  const layoutQuery = useDashboardLayout();
  const save = useSaveDashboardLayout();
  const confirm = useConfirm();

  if (isLoading || layoutQuery.isLoading) return <Spinner label="Loading workspace" />;
  if (isError || !data) return <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert"><p>We couldn’t load your workspace.</p><Button className="mt-3" variant="secondary" onClick={() => void refetch()}>Try again</Button></div>;
  if (layoutQuery.isError || !layoutQuery.data) return <div className="m-6 text-sm" role="alert">We couldn’t load your dashboard layout. <Button variant="secondary" onClick={() => void layoutQuery.refetch()}>Try again</Button></div>;
  const layout = layoutQuery.data;
  const preset = layout.preset;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-7 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">{me.workspace.name} / Overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting()}, {me.user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-zinc-500">{preset ? PRESETS[preset].label : 'Custom layout'}{layout.isDefault ? ' · Suggested for your role' : ''} · {layout.updatedAt ? `Saved ${new Date(layout.updatedAt).toLocaleString()}` : 'Not saved yet'}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link to="/settings?section=dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"><Settings2 className="h-4 w-4" /> Choose layout</Link><Button variant="ghost" loading={save.isPending} onClick={async () => { if (await confirm({ title: 'Reset your dashboard?', body: 'Your personal layout will return to the default for your role. Shared data will not change.', confirmLabel: 'Reset layout' })) save.mutate({ preset: me.workspace.role === 'member' ? 'personal' : 'executive' }); }}>Reset layout</Button></div>
      </div>

      {layout.isDefault && <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">This dashboard is suggested for your role. Choose a template or arrange widgets in <Link className="font-semibold underline" to="/settings?section=dashboard">personalization settings</Link>.</p>}
      {data.products.length === 0 && <Onboarding />}
      <DashboardDensity.Provider value={layout.density ?? 'expanded'}><DashboardModelProvider products={data.products} materials={data.materials}>
        <div className={`grid grid-cols-6 ${layout.density === 'compact' ? 'gap-2' : 'gap-4'} lg:grid-cols-12`}>
          {layout.items.map(({ widget, span }) => {
            const Widget = WIDGET_COMPONENTS[widget];
            // Below the desktop breakpoint small widgets sit two per row and the rest are full width.
            return (
              <div key={widget} className={`min-w-0 ${span <= 4 ? 'col-span-3' : 'col-span-6'} ${DESKTOP_SPAN[span]}`}>
                <Widget />
              </div>
            );
          })}
        </div>
      </DashboardModelProvider></DashboardDensity.Provider>
    </div>
  );
}
