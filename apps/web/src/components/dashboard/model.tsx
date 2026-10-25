import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getStage, nextStage, PHASES, type Material, type Product } from '@sv/shared';
import { productMetrics, useMaterialsMap } from '../ProductBits';

export interface NextMove {
  product: Product;
  label: string;
  tab: string;
  ready?: boolean;
}

/** Everything the widgets derive from the workspace, computed once per render of the page. */
function useDashboardModelValue(products: Product[], rawMaterials: Material[]) {
  const [search, setSearch] = useState('');
  const materials = useMaterialsMap(rawMaterials);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q));
  }, [products, search]);

  const metrics = useMemo(() => new Map(products.map((p) => [p.id, productMetrics(p, materials)])), [products, materials]);

  const active = useMemo(() => products.filter((p) => p.stage !== 'Retired'), [products]);

  const nextMoves = useMemo(() => {
    const moves: NextMove[] = [];
    for (const p of filtered) {
      if (p.stage === 'Retired') continue;
      const { quest } = metrics.get(p.id)!;
      if (quest.complete && nextStage(p.stage)) moves.push({ product: p, label: `Ready to move to ${nextStage(p.stage)}`, tab: 'overview', ready: true });
      else {
        const item = quest.items.find((i) => !i.done);
        if (item) moves.push({ product: p, label: item.label, tab: item.tab });
      }
    }
    return moves.sort((a, b) => Number(Boolean(b.ready)) - Number(Boolean(a.ready))).slice(0, 5);
  }, [filtered, metrics]);

  const margins = active.map((p) => metrics.get(p.id)?.summary.grossMargin).filter((m): m is number => m !== null && m !== undefined);
  const avgMargin = margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : null;
  const avgHealth = active.length ? Math.round(active.reduce((a, p) => a + (metrics.get(p.id)?.health.score ?? 0), 0) / active.length) : 0;
  const byPhase = PHASES.map((ph) => ({ ...ph, n: active.filter((p) => getStage(p.stage).phase === ph.id).length }));

  return { filtered, search, setSearch, materials, metrics, active, nextMoves, margins, avgMargin, avgHealth, byPhase };
}

export type DashboardModel = ReturnType<typeof useDashboardModelValue>;

const Ctx = createContext<DashboardModel | null>(null);

/** Render only once workspace data has loaded. */
export function DashboardModelProvider({ products, materials, children }: { products: Product[]; materials: Material[]; children: ReactNode }) {
  const value = useDashboardModelValue(products, materials);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardModel(): DashboardModel {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDashboardModel used outside DashboardModelProvider');
  return v;
}
