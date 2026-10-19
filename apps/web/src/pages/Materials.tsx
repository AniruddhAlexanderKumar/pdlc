import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Edit3, ExternalLink, Layers, Plus, Search, Trash2 } from 'lucide-react';
import { cheaperQuote, MATERIAL_CATEGORIES, type Material } from '@sv/shared';
import { useDeleteEntity, useQuickPrice, useWorkspaceData } from '../api/hooks';
import { MaterialFormModal } from '../components/MaterialForm';
import { Button, Card, CommitInput, EmptyState, IconButton, Input, PageHeader, Select, Spinner, useConfirm } from '../components/ui';
import { useMoney } from '../lib/money';

export function MaterialsPage() {
  const { data, isLoading } = useWorkspaceData();
  const quickPrice = useQuickPrice();
  const remove = useDeleteEntity('materials');
  const confirm = useConfirm();
  const { fmt, symbol } = useMoney();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [modal, setModal] = useState<{ material: Material | null } | null>(null);

  const suppliers = useMemo(() => new Map((data?.suppliers ?? []).map((s) => [s.id, s])), [data]);
  const usage = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const p of data?.products ?? []) for (const l of p.materials) m.set(l.materialId, [...(m.get(l.materialId) ?? []), { id: p.id, name: p.name }]);
    return m;
  }, [data]);

  if (isLoading || !data) return <Spinner />;
  const q = search.trim().toLowerCase();
  const list = data.materials.filter((m) => (category === 'ALL' || m.category === category) && (!q || `${m.name} ${m.description}`.toLowerCase().includes(q)));

  const onDelete = async (m: Material) => {
    const used = usage.get(m.id) ?? [];
    const ok = await confirm({
      title: `Delete “${m.name}”?`,
      body: used.length
        ? `It is used in ${used.map((u) => u.name).join(', ')}. It will be removed from those products and their costs recalculated.`
        : 'It is not used in any product.',
      confirmLabel: 'Delete material',
      danger: true
    });
    if (ok) remove.mutate(m.id);
  };

  return (
    <>
      <PageHeader
        title="Materials library"
        subtitle="Shared parts and their prices. Change a price once and every product updates."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ material: null })}>
            New material
          </Button>
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input aria-label="Search materials" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials" className="pl-9" />
          </div>
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-56">
            <option value="ALL">All categories</option>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title={data.materials.length ? 'Nothing matches' : 'No materials yet'}
            body={data.materials.length ? 'Try another search or category.' : 'Add the parts and supplies your products are made from.'}
            action={
              !data.materials.length && (
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ material: null })}>
                  New material
                </Button>
              )
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Material</th>
                    <th className="px-4 py-2.5 font-medium">Price per unit</th>
                    <th className="px-4 py-2.5 font-medium">Best quote</th>
                    <th className="px-4 py-2.5 font-medium">Used in</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {list.map((m) => {
                    const better = cheaperQuote(m);
                    const used = usage.get(m.id) ?? [];
                    return (
                      <tr key={m.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{m.name}</p>
                          <p className="text-xs text-zinc-500">
                            {m.category}
                            {m.sourceUrl && (
                              <a href={m.sourceUrl} target="_blank" rel="noreferrer noopener" className="ml-2 inline-flex items-center gap-0.5 text-indigo-600 hover:underline dark:text-indigo-400">
                                source <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <CommitInput
                              ariaLabel={`Price of ${m.name}`}
                              prefix={symbol}
                              className="w-28"
                              value={m.unitPrice}
                              onCommit={(v) => v !== null && quickPrice.mutate({ id: m.id, unitPrice: v })}
                            />
                            <span className="text-xs text-zinc-400">/{m.unit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {better ? (
                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                              {fmt(better.quotedPrice)} from {suppliers.get(better.supplierId)?.name ?? 'supplier'}
                            </span>
                          ) : m.suppliers.length ? (
                            <span className="text-zinc-500">
                              {m.suppliers.length} quote{m.suppliers.length > 1 ? 's' : ''}, none cheaper
                            </span>
                          ) : (
                            <span className="text-zinc-400">No quotes</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {used.length === 0 ? (
                            <span className="text-zinc-400">Not used</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {used.map((u) => (
                                <Link key={u.id} to={`/products/${u.id}/materials`} className="rounded-md bg-zinc-100 px-1.5 py-0.5 hover:bg-indigo-500/10 dark:bg-zinc-800">
                                  {u.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end">
                            <IconButton label={`Edit ${m.name}`} onClick={() => setModal({ material: m })}>
                              <Edit3 className="h-4 w-4" />
                            </IconButton>
                            <IconButton label={`Delete ${m.name}`} onClick={() => onDelete(m)} className="hover:text-rose-600">
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      {modal && <MaterialFormModal material={modal.material} suppliers={data.suppliers} onClose={() => setModal(null)} />}
    </>
  );
}
