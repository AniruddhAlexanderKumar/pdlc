import { Plus, Rocket, Wand2 } from 'lucide-react';
import { PHASES, PRESETS, resolveLayout, type DashboardSpan } from '@sv/shared';
import { useDashboardLayout, useLoadSamples, useSession, useSetDashboardPreset, useWorkspaceData } from '../api/hooks';
import { useNewProduct } from '../components/Layout';
import { DashboardModelProvider } from '../components/dashboard/model';
import { PresetPicker } from '../components/dashboard/PresetPicker';
import { WIDGET_COMPONENTS } from '../components/dashboard/widgets';
import { Button, Card, Spinner } from '../components/ui';
import { useIsDesktop } from '../lib/useMediaQuery';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Onboarding() {
  const openNew = useNewProduct();
  const samples = useLoadSamples();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
          <Rocket className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Let’s get your first product moving</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          Every product goes through three steps. Answer a few questions, track your costs, and level it up with suggestions. You earn XP along the way.
        </p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {PHASES.map((p, i) => (
          <Card key={p.id} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Step {i + 1}</p>
            <p className="mt-1 font-semibold">{p.label}</p>
            <p className="mt-1 text-sm text-zinc-500">{p.blurb}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          Create my first product
        </Button>
        <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={samples.isPending} onClick={() => samples.mutate()}>
          Explore with sample products
        </Button>
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
  const { data, isLoading } = useWorkspaceData();
  const layoutQuery = useDashboardLayout();
  const setPreset = useSetDashboardPreset();
  const isDesktop = useIsDesktop();

  if (isLoading || !data || layoutQuery.isLoading) return <Spinner />;
  if (data.products.length === 0) return <Onboarding />;

  // Phones and tablets always get the standard layout; customizing is desktop-only.
  // If the saved layout cannot be loaded, fall back to the default rather than blocking the page.
  const layout = isDesktop && layoutQuery.data ? layoutQuery.data : resolveLayout(null);
  const preset = layoutQuery.data?.preset ?? null;

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {greeting()}, {me.user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-zinc-500">{isDesktop && preset ? PRESETS[preset].blurb : 'Here’s where your products stand and what to do next.'}</p>
        </div>
        {isDesktop && layoutQuery.data && <PresetPicker current={preset} onChange={(p) => setPreset.mutate(p)} />}
      </div>

      <DashboardModelProvider products={data.products} materials={data.materials}>
        <div className="grid grid-cols-6 gap-3 lg:grid-cols-12">
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
      </DashboardModelProvider>
    </div>
  );
}
