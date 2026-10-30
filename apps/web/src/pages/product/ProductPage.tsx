import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, ClipboardList, Edit3, Lightbulb, MessageCircleQuestion, Package, Receipt, Trash2, Wrench } from 'lucide-react';
import { isAnswered, questionsForStage, stageIndex, STAGES, type Product, type StageId } from '@sv/shared';
import { useDeleteProduct, useUpdateProduct, useWorkspaceData } from '../../api/hooks';
import { productMetrics, ProductThumb, useMaterialsMap } from '../../components/ProductBits';
import { cx, EmptyState, GradeBadge, IconButton, Select, Spinner, stageStyle, useConfirm } from '../../components/ui';
import { useMoney } from '../../lib/money';
import { CostsTab } from './CostsTab';
import { DiscoverTab } from './DiscoverTab';
import { EditProductModal } from './EditProductModal';
import { ImproveTab } from './ImproveTab';
import { MaterialsTab } from './MaterialsTab';
import { OverviewTab } from './OverviewTab';
import { TasksTab } from './TasksTab';

export const TABS = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'discover', label: 'Tell us', icon: MessageCircleQuestion },
  { id: 'materials', label: 'Materials', icon: Wrench },
  { id: 'costs', label: 'Track it', icon: Receipt },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'improve', label: 'Improve it', icon: Lightbulb }
] as const;
export type TabId = (typeof TABS)[number]['id'];

function JourneyStepper({ product, onPick }: { product: Product; onPick: (s: StageId) => void }) {
  const current = stageIndex(product.stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Lifecycle stages">
      {STAGES.filter((s) => s.id !== 'Retired').map((s, i) => {
        const done = i < current && product.stage !== 'Retired';
        const isCurrent = s.id === product.stage;
        const required = questionsForStage(s.id).filter((q) => q.required);
        const answered = required.filter((q) => isAnswered(product.answers[q.key])).length;
        return (
          <li key={s.id} className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onPick(s.id)}
              title={`${s.label}: ${answered}/${required.length} questions answered`}
              className={cx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                isCurrent
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-800'
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <span className={cx('h-1.5 w-1.5 rounded-full', isCurrent ? 'bg-white' : stageStyle(s.id).dot)} />}
              {s.label}
            </button>
            {i < STAGES.length - 2 && <span className={cx('h-px w-3', i < current ? 'bg-emerald-400' : 'bg-zinc-200 dark:bg-zinc-800')} />}
          </li>
        );
      })}
    </ol>
  );
}

export function ProductPage() {
  const { id = '', tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useWorkspaceData();
  const materials = useMaterialsMap(data?.materials);
  const update = useUpdateProduct(id);
  const remove = useDeleteProduct();
  const confirm = useConfirm();
  const { fmt } = useMoney();
  const [editing, setEditing] = useState(false);

  if (isLoading || !data) return <Spinner />;
  const product = data.products.find((p) => p.id === id);
  if (!product) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="Product not found"
          body="It may have been deleted by someone on your team."
          action={
            <Link to="/products" className="text-sm font-medium text-blue-600">
              Back to products
            </Link>
          }
        />
      </div>
    );
  }

  const activeTab = (TABS.some((t) => t.id === tab) ? tab : 'overview') as TabId;
  const goTab = (t: TabId) => navigate(`/products/${product.id}/${t}`);
  const { summary, health, quest } = productMetrics(product, materials);

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
              <div className="mt-2 flex items-center gap-2">
                <Select
                  aria-label="Stage"
                  className="w-40 py-1 text-xs"
                  value={product.stage}
                  onChange={(e) => update.mutate({ stage: e.target.value as StageId })}
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-zinc-500 tabular-nums">
                  Checklist {quest.done}/{quest.total}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-[11px] text-zinc-500">Unit cost</p>
                <p className="font-semibold tabular-nums">{fmt(summary.totalUnitCost)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Price</p>
                <p className="font-semibold tabular-nums">{fmt(summary.targetPrice)}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Margin</p>
                <p
                  className={cx(
                    'font-semibold tabular-nums',
                    summary.grossMargin === null ? '' : summary.grossMargin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  )}
                >
                  {summary.grossMargin === null ? '—' : `${summary.grossMargin}%`}
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
        <div className="mt-4">
          <JourneyStepper product={product} onPick={(s) => navigate(`/products/${product.id}/discover?stage=${s}`)} />
        </div>
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
        {activeTab === 'overview' && <OverviewTab product={product} materials={materials} goTab={goTab} />}
        {activeTab === 'discover' && <DiscoverTab product={product} />}
        {activeTab === 'materials' && <MaterialsTab product={product} materials={materials} />}
        {activeTab === 'costs' && <CostsTab product={product} materials={materials} />}
        {activeTab === 'tasks' && <TasksTab product={product} />}
        {activeTab === 'improve' && <ImproveTab product={product} goTab={goTab} />}
      </div>

      {editing && <EditProductModal product={product} onClose={() => setEditing(false)} />}
    </div>
  );
}
