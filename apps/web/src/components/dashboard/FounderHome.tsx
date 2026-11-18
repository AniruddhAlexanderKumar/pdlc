import { Link, useSearchParams } from 'react-router';
import { ArrowRight, ChevronRight, CircleDot, Layers3, Mic, Settings2, Wand2 } from 'lucide-react';
import { CHAPTER_BRIEFS, PATH_STAGES, type WorkspaceData } from '@sv/shared';
import { WorldPath } from '../journey/WorldPath';
import { useDrafts, useLoadSamples, useSession } from '../../api/hooks';
import { useNewProduct, useVoiceDictation } from '../Layout';
import { useMaterialsMap } from '../ProductBits';
import { BuildPlate } from '../journey/BuildPlate';
import { stageIcon } from '../journey/JourneyMap';
import { Button, Select } from '../ui';

/** A preview for an empty workspace; selected products always use the live path. */
function ChapterIndex() {
  return (
    <section aria-labelledby="chapter-index">
      <p className="sv-kicker">Chapter index</p>
      <h2 id="chapter-index" className="mt-1 text-2xl font-semibold">
        Your product journey
      </h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PATH_STAGES.map((stage, i) => {
          const Icon = stageIcon(stage);
          return (
            <li key={stage} className="sv-sheet p-4">
              <div className="flex items-center justify-between">
                <span className="sv-icon">
                  <Icon size={19} />
                </span>
                <span className="font-mono text-xs text-zinc-500">CH / {String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-3 font-semibold">{stage}</h3>
              <p className="text-xs text-zinc-500">{CHAPTER_BRIEFS[stage]}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function FounderHome({ data }: { data: WorkspaceData }) {
  const me = useSession(),
    openNew = useNewProduct(),
    openVoice = useVoiceDictation(),
    samples = useLoadSamples(),
    drafts = useDrafts();
  const [params, setParams] = useSearchParams();
  const materials = useMaterialsMap(data.materials);
  const active = data.products.filter((p) => p.stage !== 'Retired');
  const product =
    data.products.find((p) => p.id === params.get('product')) ??
    active.find((p) => p.id === drafts.data?.find((d) => active.some((p) => p.id === d.productId))?.productId) ??
    active[0] ??
    data.products[0];
  return (
    <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-xs dark:border-zinc-800">
        <span className="inline-flex items-center gap-2 text-zinc-500">
          <Layers3 size={15} />
          {me.workspace.name}
          <ChevronRight size={13} />{' '}
          <strong className="text-zinc-700 dark:text-zinc-200">Founder workspace</strong>
        </span>
        <Link className="inline-flex items-center gap-2 text-zinc-500 hover:underline" to="/?view=workspace">
          <Settings2 size={14} /> Workspace overview
        </Link>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sv-kicker">Field guide / Dashboard</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
            {product ? 'Your building desk' : 'Let’s build your product.'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {product
              ? 'Pick up where you left off, one useful activity at a time.'
              : 'Start with an idea. We’ll help you decide what to do next.'}
          </p>
        </div>
        {product && (
          <Select
            aria-label="Current product"
            className="w-full sm:!w-auto sm:max-w-56 text-sm"
            value={product.id}
            onChange={(e) => setParams({ product: e.target.value, view: 'journey' })}
          >
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </header>
      {product ? (
        <WorldPath key={product.id} product={product} materials={materials} />
      ) : (
        <>
          <section className="sv-build-card">
            <div className="p-6 sm:p-8">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a5dcce]">
                <CircleDot size={14} /> Your starting point
              </p>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">Give your idea a name.</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#c3dadd]">
                Your first chapter turns a rough idea into a concept brief. No technical background or business
                plan needed.
              </p>
              <button
                onClick={openNew}
                className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-md bg-[#d4efda] px-5 text-sm font-bold text-[#143f43] hover:bg-white"
              >
                Create a product <ArrowRight size={16} />
              </button>
            </div>
            <div className="hidden self-center sm:block">
              <BuildPlate annotated={false} />
            </div>
          </section>
          <ChapterIndex />
          <div className="flex flex-wrap gap-3">
            {!me.demo && (
              <Button variant="secondary" icon={<Mic size={15} />} onClick={openVoice}>
                Use voice capture
              </Button>
            )}
            {!data.products.length && (
              <Button
                variant="secondary"
                icon={<Wand2 size={15} />}
                onClick={() => samples.mutate()}
                loading={samples.isPending}
              >
                Explore sample products
              </Button>
            )}
            {data.products.length > 0 && (
              <Link to="/products" className="sv-link text-sm">
                View archived products →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
