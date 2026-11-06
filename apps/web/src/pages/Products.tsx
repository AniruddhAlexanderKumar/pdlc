import { useMemo, useState } from 'react';
import { Mic, Package, Plus, Search } from 'lucide-react';
import type { StageId } from '@sv/shared';
import { useWorkspaceData } from '../api/hooks';
import { useNewProduct, useVoiceDictation } from '../components/Layout';
import { ProductCard, StagePills, useMaterialsMap } from '../components/ProductBits';
import { Button, EmptyState, Input, PageHeader, Spinner } from '../components/ui';

export function ProductsPage() {
  const { data, isLoading } = useWorkspaceData();
  const openNew = useNewProduct();
  const openVoice = useVoiceDictation();
  const materials = useMaterialsMap(data?.materials);
  const [stage, setStage] = useState<StageId | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of data?.products ?? []) c[p.stage] = (c[p.stage] ?? 0) + 1;
    return c;
  }, [data]);

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) => (stage === 'ALL' || p.stage === stage) && (!q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q))
    );
  }, [data, stage, search]);

  if (isLoading || !data) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Products in your workspace, with their stage and progress."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              onClick={openVoice}
            >
              Voice dictate
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              New product
            </Button>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <StagePills value={stage} onChange={setStage} counts={counts} />
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or category" className="pl-9" />
          </div>
        </div>
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={data.products.length === 0 ? 'No products yet' : 'Nothing matches'}
            body={data.products.length === 0 ? 'Create a product and we’ll walk you through it.' : 'Try a different stage or search.'}
            action={
              data.products.length === 0 && (
                <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                  New product
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} materials={materials} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
