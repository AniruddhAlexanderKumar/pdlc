import { Settings2 } from 'lucide-react';
import { FounderHome } from '../components/dashboard/FounderHome';
import { Link, useSearchParams } from 'react-router';
import { PRESETS, WIDGET_DEFINITIONS, isProjectFocusedDefault, type DashboardSpan } from '@sv/shared';
import { useDashboardLayout, useSession, useSaveDashboardLayout, useWorkspaceData, useWorkspaceProfile } from '../api/hooks';
import { useNewProduct } from '../components/Layout';
import { DashboardModelProvider } from '../components/dashboard/model';
import { DashboardDensity } from '../components/dashboard/density';
import { AssignedIssues } from '../components/dashboard/ProjectWidgets';
import { WIDGET_COMPONENTS } from '../components/dashboard/widgets';
import { Button, Spinner, useConfirm } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
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
  const [params] = useSearchParams();
  const me = useSession();
  const openNew = useNewProduct();
  const { data, isLoading, isError, refetch } = useWorkspaceData();
  const layoutQuery = useDashboardLayout();
  const workspaceProfile = useWorkspaceProfile();
  const save = useSaveDashboardLayout();
  const confirm = useConfirm();

  if (isLoading || layoutQuery.isLoading || workspaceProfile.isLoading) return <Spinner label="Loading workspace" />;
  if (isError || !data) return <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert"><p>We couldn’t load your workspace.</p><Button className="mt-3" variant="secondary" onClick={() => void refetch()}>Try again</Button></div>;
  if (layoutQuery.isError || !layoutQuery.data) return <div className="m-6 text-sm" role="alert">We couldn’t load your dashboard layout. <Button variant="secondary" onClick={() => void layoutQuery.refetch()}>Try again</Button></div>;
  const layout = layoutQuery.data;
  const preset = layout.preset;
  const profile = workspaceProfile.data?.profile;
  // Adapt only the unsaved default; never rewrite or hide widgets in a personal saved layout.
  const projectFocused = isProjectFocusedDefault(profile, layout.isDefault);
  const visibleItems = projectFocused ? layout.items.filter(item => WIDGET_DEFINITIONS[item.widget].dataSource !== 'workspace products') : layout.items;

  if (params.get('view') === 'journey' || (params.get('view') !== 'workspace' && !projectFocused && layout.isDefault)) return <FounderHome data={data}/>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-7 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">{me.workspace.name} / Overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting()}, {me.user.name.split(' ')[0]}
          </h1>
          <p className="text-xs font-medium capitalize text-zinc-500">{me.workspace.role} · {me.workspace.mode === 'solo' ? 'Personal workspace' : 'Team workspace'}</p>
          <p className="text-sm text-zinc-500">{preset ? PRESETS[preset].label : 'Custom layout'}{layout.isDefault ? projectFocused ? ' · Suggested for this workspace and your role' : ' · Suggested for your role' : ''} · {layout.updatedAt ? `Saved ${new Date(layout.updatedAt).toLocaleString()}` : 'Not saved yet'}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link to="/settings?section=dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"><Settings2 className="h-4 w-4" /> Choose layout</Link><Link className="sv-primary-link" to="/?view=journey">Founder journey →</Link><Button variant="ghost" loading={save.isPending} onClick={async () => { if (await confirm({ title: 'Reset your dashboard?', body: 'Your personal layout will return to the default for your role. Shared data will not change.', confirmLabel: 'Reset layout' })) save.mutate({ preset: me.workspace.role === 'member' ? 'personal' : 'executive' }); }}>Reset layout</Button></div>
      </div>

      {!me.demo && workspaceProfile.data?.profile === null && me.workspace.role !== 'member' && <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950"><h2 className="font-semibold">Make this workspace yours</h2><p className="mt-1">Tell us what you are working on and choose which existing tools to prioritise. You can change this later.</p><Link className="mt-2 inline-block font-semibold underline" to="/workspace-setup">Set up workspace</Link></section>}
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-sm font-semibold">Quick actions</h2><div className="mt-3 flex flex-wrap gap-2">{me.workspace.role !== 'member' && <Link to="/projects?create=1" className="inline-flex min-h-10 items-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">Create project</Link>}<Button variant="secondary" onClick={openNew}>Create product</Button><Link to="/projects" className="inline-flex min-h-10 items-center rounded-md border border-zinc-200 px-4 text-sm font-semibold dark:border-zinc-700">View project work</Link><Link to="/help" className="inline-flex min-h-10 items-center rounded-md border border-zinc-200 px-4 text-sm font-semibold dark:border-zinc-700">Get help</Link></div></section>
      {layout.isDefault && !visibleItems.some(item => item.widget === 'assigned-issues') && <AssignedIssues />}
      {layout.isDefault && <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">This dashboard is suggested for your workspace and role. Choose a template or arrange widgets in <Link className="font-semibold underline" to="/settings?section=dashboard">personalization settings</Link>.</p>}

      <DashboardDensity.Provider value={layout.density ?? 'expanded'}><DashboardModelProvider products={data.products} materials={data.materials}>
        <div className={`grid grid-cols-6 ${layout.density === 'compact' ? 'gap-2' : 'gap-4'} lg:grid-cols-12`}>
          {visibleItems.map(({ widget, span }) => {
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
