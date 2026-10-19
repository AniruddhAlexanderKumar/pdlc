import { useState } from 'react';
import { Plus, Trash2, Wrench } from 'lucide-react';
import { XP, type Material, type Product } from '@sv/shared';
import { useRemoveBomLine, useSetBomLine, useWorkspaceData } from '../../api/hooks';
import { MaterialFormModal } from '../../components/MaterialForm';
import { productMetrics } from '../../components/ProductBits';
import { Button, Card, CardHeader, CommitInput, EmptyState, IconButton, Input, Select } from '../../components/ui';
import { useMoney } from '../../lib/money';

export function MaterialsTab({ product, materials }: { product: Product; materials: Map<string, Material> }) {
  const { data } = useWorkspaceData();
  const setLine = useSetBomLine(product.id);
  const removeLine = useRemoveBomLine(product.id);
  const { fmt } = useMoney();
  const { summary } = productMetrics(product, materials);
  const [pick, setPick] = useState('');
  const [qty, setQty] = useState('1');
  const [creating, setCreating] = useState(false);

  const available = (data?.materials ?? []).filter((m) => !product.materials.some((l) => l.materialId === m.id));

  const add = (materialId: string) => {
    const quantity = Number(qty);
    if (!materialId || !(quantity > 0)) return;
    setLine.mutate({ materialId, quantity }, { onSuccess: () => setPick('') });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<Wrench className="h-4 w-4" />}
          title="Bill of materials"
          subtitle={`Everything that goes into one unit. +${XP.materialAdded} XP per material added.`}
          action={
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
              New material
            </Button>
          }
        />
        <div className="flex flex-col gap-2 border-b border-zinc-100 p-4 sm:flex-row dark:border-zinc-800">
          <Select aria-label="Material to add" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
            <option value="">{available.length ? 'Choose a material from your library…' : 'All library materials are already added'}</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {fmt(m.unitPrice)}/{m.unit}
              </option>
            ))}
          </Select>
          <Input aria-label="Quantity" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="sm:w-28" />
          <Button onClick={() => add(pick)} disabled={!pick} loading={setLine.isPending}>
            Add
          </Button>
        </div>

        {summary.lines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Wrench className="h-6 w-6" />}
              title="No materials yet"
              body="Add the parts, packaging and finishes that go into one unit. Costs update automatically."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Material</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2 font-medium">Qty per unit</th>
                  <th className="px-4 py-2 text-right font-medium">Line cost</th>
                  <th className="px-4 py-2 text-right font-medium">Share</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {summary.lines.map((l) => (
                  <tr key={l.materialId}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{l.material?.name ?? 'Missing material'}</p>
                      <p className="text-xs text-zinc-500">{l.material?.category}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {fmt(l.unitPrice)}
                      <span className="text-xs text-zinc-400">/{l.material?.unit}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <CommitInput
                        ariaLabel={`Quantity of ${l.material?.name}`}
                        className="w-24"
                        value={l.quantity}
                        min={0.0001}
                        onCommit={(v) => v && v > 0 && setLine.mutate({ materialId: l.materialId, quantity: v })}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmt(l.lineCost)}</td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-500">
                      {summary.totalUnitCost > 0 ? `${Math.round((l.lineCost / summary.totalUnitCost) * 100)}%` : '—'}
                    </td>
                    <td className="px-2">
                      <IconButton label={`Remove ${l.material?.name}`} onClick={() => removeLine.mutate(l.materialId)} className="hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-700">
                  <td className="px-4 py-2.5" colSpan={3}>
                    Materials per unit
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(summary.materialsCost)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <MaterialFormModal material={null} suppliers={data?.suppliers ?? []} onClose={() => setCreating(false)} onSaved={(m) => setPick(m.id)} />
      )}
    </div>
  );
}
