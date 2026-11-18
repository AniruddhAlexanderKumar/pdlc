import { WorldPath } from '../../components/journey/WorldPath';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Box, ClipboardList, Edit3, Lightbulb, Map as MapIcon, MessageCircleQuestion, Package, Receipt, Trash2, Wrench } from 'lucide-react';
import { activityHref, buildJourney, nextWork, STAGE_IDS, type Product, type StageId } from '@sv/shared';
import { JourneyMap } from '../../components/journey/JourneyMap';
import { StageOverview } from '../../components/journey/StageOverview';
import { StageActivities, TeamContributionCard } from '../../components/journey/StageActivities';
import {
  useActivityStatus,
  useAssignActivity,
  useCollaboration,
  useReviewActivity,
  useSubmitReview
} from '../../api/collaboration';
import { useDeleteProduct, useDrafts, useSession, useUpdateProduct, useWorkspaceData } from '../../api/hooks';
import { productMetrics, ProductThumb, useMaterialsMap } from '../../components/ProductBits';
import { Button, Card, cx, EmptyState, GradeBadge, IconButton, Spinner, useConfirm } from '../../components/ui';
import { useMoney } from '../../lib/money';
import { CostsTab } from './CostsTab';
import { DiscoverTab } from './DiscoverTab';
import { EditProductModal } from './EditProductModal';
import { ImproveTab } from './ImproveTab';
import { MaterialsTab } from './MaterialsTab';
import { OverviewTab } from './OverviewTab';
import { TasksTab } from './TasksTab';
import { CadTab } from './CadTab';

export const TABS = [
  { id: 'journey', label: 'Journey', icon: MapIcon },
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'discover', label: 'Activities & briefs', icon: MessageCircleQuestion },
  { id: 'materials', label: 'Materials', icon: Wrench },
  { id: 'costs', label: 'Cost sheet', icon: Receipt },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'improve', label: 'Improve it', icon: Lightbulb },
  { id: 'cad', label: '3D CAD', icon: Box }
] as const;
export type TabId = (typeof TABS)[number]['id'];

export function ProductPage() {
  const { id = '', tab = 'journey' } = useParams();
  const query = useWorkspaceData();
  if (query.isLoading) return <Spinner label="Loading product"/>;
  if (!query.data) return <div className="p-5" role="alert">Could not load this product. <Button variant="secondary" onClick={() => query.refetch()}>Retry</Button></div>;
  const product = query.data.products.find(p => p.id === id);
  if (!product) return <EmptyState icon={<Package/>} title="Product not found" body="It is not in the current workspace." action={<Link className="sv-link" to="/products">Back to products</Link>}/>;
  return <ProductWorkspace key={product.id} product={product} tab={tab} catalog={query.data.materials}/>;
}
function ProductWorkspace({ product, tab, catalog }: { product: Product; tab: string; catalog: import('@sv/shared').Material[] }) {
  const pOnPath = product.stage !== 'Retired';
  const id = product.id, navigate = useNavigate(), materials = useMaterialsMap(catalog);
  const update = useUpdateProduct(id), remove = useDeleteProduct(), confirm = useConfirm(), { fmt } = useMoney();
  const [editing, setEditing] = useState(false);
  const me = useSession(), [params, setParams] = useSearchParams();
  const collabQuery = useCollaboration(id), drafts = useDrafts();
  const assign = useAssignActivity(id), setStatus = useActivityStatus(id), submitReview = useSubmitReview(id), review = useReviewActivity(id);
  const collab = collabQuery.data;
  const activeTab = (TABS.some((t) => t.id === tab) ? tab : 'journey') as TabId;
  const goTab = (t: TabId) => navigate(`/products/${product.id}/${t}`);
  const { summary, health } = productMetrics(product, materials);

  // One journey model drives every surface: the map, the stage overview, the
  // locks and the "continue" action. It reads completion from stageQuest(), the
  // same rule the server enforces, so the UI cannot overstate progress.
  // Prefer the server's journey: it carries ownership, blockers and the
  // approval gate. The locally built one is the fallback while it loads.
  const localJourney = buildJourney(product, {
    materials,
    visitedStages: product.legacyStage ? STAGE_IDS.slice(0, STAGE_IDS.indexOf(product.legacyStage) + 1) : []
  });
  const journey = collab?.journey ?? localJourney;

  // Stage the overview panel is focused on. Defaults to the product's real stage.
  const focusStage = params.get('stage') ?? product.stage;
  const setFocusStage = (stage: StageId) => setParams({ stage });
  const focused = journey.stages.find(s => s.id === focusStage) ?? journey.current;
  const [openActivityKey, setOpenActivityKey] = useState<string | null>(params.get('activity'));
  useEffect(() => setOpenActivityKey(params.get('activity')), [params]);
  const advance = async (to: StageId) => {
    if (to === 'Retired' && !await confirm({ title: `Archive “${product.name}”?`, body: 'It will leave your building desk. Its briefs, tasks and costs remain available in Products.', confirmLabel: 'Archive product' })) return;
    update.mutate({ stage: to }, { onSuccess: () => {
      const revisiting = STAGE_IDS.indexOf(to) < STAGE_IDS.indexOf(product.stage);
      navigate(`/products/${id}/discover?stage=${to}${revisiting ? '&view=brief' : ''}`);
    } });
  };
  const openHref = (href: string) => navigate(href);
  const work = nextWork(product, journey, collab?.recommendations ?? [], drafts.data, collab?.trail);
  const openActivity = (key: string) => {
    const stageOf = focused.activities.some(a => a.id === key) ? focused : journey.stages.find(st => st.activities.some(a => a.id === key));
    const activity = stageOf?.activities.find(a => a.id === key);
    if (activity && stageOf) navigate(activityHref(product.id, stageOf.id, activity));
  };
  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${product.name}”?`,
      body: 'This permanently removes the product, its answers, tasks and bill of materials. Library materials and suppliers are kept.',
      confirmLabel: 'Delete product',
      danger: true
    });
    if (ok) remove.mutate(product.id, { onSuccess: () => navigate('/products') });
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-4 pt-4 md:px-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconButton label="Back" onClick={() => navigate(-1)} className="mt-2.5">
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <ProductThumb name={product.name} imageUrl={product.imageUrl} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight">{product.name}</h1>
                <GradeBadge grade={health.grade} score={health.score} />
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">{product.category}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16598d]/10 px-2.5 py-1 text-xs font-semibold text-[#16598d] dark:text-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16598d] dark:bg-blue-400" aria-hidden="true" />
                  {product.stage === 'Retired'
                    ? 'Archived product'
                    : `Chapter ${journey.currentIndex + 1} of ${journey.totalCount} · ${product.stage}`}
                </span>
                <span className="text-xs tabular-nums text-zinc-500">
                  {journey.overallPercent}% of the journey · {journey.current.done}/{journey.current.total} core
                  activities
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden grid-cols-3 gap-4 text-right xl:grid">
              <div>
                <p className="text-[11px] text-zinc-500">Unit cost</p>
                <p className="font-semibold tabular-nums">{fmt(summary.totalUnitCost)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Price</p>
                <p className="font-semibold tabular-nums">{fmt(summary.targetPrice)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Est. margin</p>
                <p
                  className={cx(
                    'font-semibold tabular-nums',
                    summary.grossMargin === null || !summary.totalUnitCost
                      ? ''
                      : summary.grossMargin >= 30
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                  )}
                >
                  {summary.grossMargin === null || !summary.totalUnitCost ? '—' : `${summary.grossMargin}%`}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <IconButton label="Edit product" onClick={() => setEditing(true)}>
                <Edit3 className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete product" onClick={onDelete} className="hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </div>
        {activeTab !== 'discover' && activeTab !== 'overview' && activeTab !== 'journey' && (
          <div className="mt-4">
            <Link className="sv-link inline-flex items-center gap-2 text-sm" to={work.href}>
              <MapIcon size={15} /> {work.action}: {work.title}
            </Link>
          </div>
        )}
        <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto" aria-label="Product sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
              className={cx(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                activeTab === t.id
                  ? 'border-blue-600 text-zinc-900 dark:border-blue-400 dark:text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 px-4 py-5 md:px-6">
        {activeTab === 'journey' && !params.get('stage') && pOnPath && (
          <WorldPath product={product} materials={materials} />
        )}
        {activeTab === 'journey' && (!pOnPath || !!params.get('stage')) && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="hidden space-y-4 lg:block">
              <Card className="h-fit p-4">
                <JourneyMap journey={journey} onSelect={(s) => setFocusStage(s)} />
              </Card>
              {collab && <TeamContributionCard team={collab.team} currentUserId={me.user.id} />}
            </div>
            <div className="min-w-0 space-y-4">
              <label className="flex items-center gap-3 text-sm lg:hidden">
                View chapter{' '}
                <select
                  className="rounded-md border bg-white p-2 dark:bg-zinc-900"
                  value={focused.id}
                  onChange={(e) => setFocusStage(e.target.value as StageId)}
                >
                  {journey.stages.map((st) => (
                    <option key={st.id}>{st.id}</option>
                  ))}
                </select>
              </label>
              {collabQuery.isError && (
                <p className="rounded-md border p-3 text-sm" role="status">
                  Team activity could not be refreshed.{' '}
                  <button className="sv-link" onClick={() => collabQuery.refetch()}>
                    Try again
                  </button>
                </p>
              )}
              {focused.id === product.stage && !focused.complete && (
                <div className="sv-inset p-5">
                  <p className="sv-kicker">Continue building</p>
                  <h2 className="mt-2 text-lg font-semibold">{work.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{work.reason}</p>
                  <Link className="sv-link mt-3 inline-block text-sm" to={work.href}>
                    {work.action} →
                  </Link>
                </div>
              )}
              <StageOverview
                checkpointXp={collab?.trail.rewards.checkpoint}
                product={product}
                stage={focused}
                nextStageId={focused.id === product.stage ? journey.nextStageId : null}
                isCurrent={focused.id === product.stage}
                onGoTab={openHref}
                onAdvance={advance}
                advancing={update.isPending}
                renderActivities={
                  collab
                    ? () => (
                        <StageActivities
                          productId={product.id}
                          journey={journey}
                          answers={product.answers}
                          dependencies={collab.dependencies}
                          stage={focused}
                          team={collab.team}
                          canManage={me.workspace.role !== 'member'}
                          currentUserId={me.user.id}
                          busy={
                            assign.isPending || setStatus.isPending || submitReview.isPending || review.isPending
                          }
                          openKey={openActivityKey}
                          onToggleKey={(key) => setOpenActivityKey((cur) => (cur === key ? null : key))}
                          onOpenActivity={openActivity}
                          onAssign={(key, assigneeId) => assign.mutate({ key, assigneeId })}
                          onStatus={(key, status) => setStatus.mutate({ key, status })}
                          onSubmitReview={(key) => submitReview.mutate({ key })}
                          onReview={(key, decision, note) =>
                            review.mutate({ key, decision, note, expectedAnswer: product.answers[key] ?? null })
                          }
                          onJumpToBlocker={openActivity}
                        />
                      )
                    : undefined
                }
              />
            </div>
          </div>
        )}
        {activeTab === 'overview' && (
          <OverviewTab
            journey={journey}
            work={work}
            product={product}
            materials={materials}
            goTab={goTab}
            openHref={openHref}
          />
        )}
        {activeTab === 'discover' && <DiscoverTab product={product} />}
        {activeTab === 'materials' && <MaterialsTab product={product} materials={materials} />}
        {activeTab === 'costs' && <CostsTab product={product} materials={materials} />}
        {activeTab === 'tasks' && <TasksTab product={product} />}
        {activeTab === 'improve' && <ImproveTab product={product} goTab={goTab} />}
        {activeTab === 'cad' && <CadTab product={product} />}
      </div>

      {editing && <EditProductModal product={product} onClose={() => setEditing(false)} />}
    </div>
  );
}
