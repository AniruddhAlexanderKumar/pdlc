import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, type Material, type Supplier } from '@sv/shared';
import { useSaveMaterial } from '../api/hooks';
import { useMoney } from '../lib/money';
import { Button, Field, IconButton, Input, Modal, Select, Textarea } from './ui';

export function MaterialFormModal({
  material,
  suppliers,
  onClose,
  onSaved
}: {
  material: Material | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved?: (m: Material) => void;
}) {
  const save = useSaveMaterial();
  const { symbol } = useMoney();
  const [form, setForm] = useState({
    name: material?.name ?? '',
    category: material?.category ?? MATERIAL_CATEGORIES[0],
    unit: material?.unit ?? 'pcs',
    unitPrice: material ? String(material.unitPrice) : '',
    description: material?.description ?? '',
    sourceUrl: material?.sourceUrl ?? '',
    notes: material?.notes ?? ''
  });
  const [quotes, setQuotes] = useState(
    (material?.suppliers ?? []).map((q) => ({ supplierId: q.supplierId, quotedPrice: String(q.quotedPrice), moq: q.moq === null ? '' : String(q.moq) }))
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const unusedSuppliers = suppliers.filter((s) => !quotes.some((q) => q.supplierId === s.id));

  const submit = () => {
    save.mutate(
      {
        id: material?.id,
        name: form.name,
        category: form.category,
        unit: form.unit,
        unitPrice: Number(form.unitPrice) || 0,
        description: form.description,
        sourceUrl: form.sourceUrl,
        notes: form.notes,
        suppliers: quotes
          .filter((q) => q.supplierId)
          .map((q) => ({ supplierId: q.supplierId, quotedPrice: Number(q.quotedPrice) || 0, moq: q.moq === '' ? null : Math.max(1, Math.round(Number(q.moq))) }))
      },
      {
        onSuccess: (res) => {
          onSaved?.(res.data);
          onClose();
        }
      }
    );
  };

  return (
    <Modal
      title={material ? 'Edit material' : 'New material'}
      subtitle={material ? 'Price changes update every product that uses this material.' : 'Add it once, use it in any product.'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!form.name.trim()}>
            {material ? 'Save changes' : 'Add material'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" htmlFor="m-name">
          <Input id="m-name" required maxLength={160} value={form.name} onChange={set('name')} placeholder="e.g. Stainless Steel Bottle Body" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category" htmlFor="m-cat">
            <Select id="m-cat" value={form.category} onChange={set('category')}>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unit" htmlFor="m-unit">
            <Select id="m-unit" value={form.unit} onChange={set('unit')}>
              {MATERIAL_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Price per unit" htmlFor="m-price">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{symbol}</span>
              <Input id="m-price" type="number" min={0} step="any" className="pl-8" value={form.unitPrice} onChange={set('unitPrice')} />
            </div>
          </Field>
        </div>
        <Field label="Description" htmlFor="m-desc">
          <Textarea id="m-desc" rows={2} maxLength={2000} value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source link" htmlFor="m-url">
            <Input id="m-url" type="url" value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://" />
          </Field>
          <Field label="Notes" htmlFor="m-notes">
            <Input id="m-notes" maxLength={4000} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>

        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Supplier quotes</p>
              <p className="text-xs text-zinc-500">Cheaper quotes show up as suggestions in “Improve it”.</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={unusedSuppliers.length === 0}
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setQuotes((q) => [...q, { supplierId: unusedSuppliers[0].id, quotedPrice: form.unitPrice, moq: '' }])}
            >
              Add quote
            </Button>
          </div>
          {suppliers.length === 0 && <p className="text-xs text-zinc-500">Add suppliers on the Suppliers page to record quotes.</p>}
          <div className="space-y-2">
            {quotes.map((q, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_90px_auto] items-center gap-2">
                <Select
                  aria-label="Supplier"
                  value={q.supplierId}
                  onChange={(e) => setQuotes((all) => all.map((x, j) => (j === i ? { ...x, supplierId: e.target.value } : x)))}
                >
                  {suppliers
                    .filter((s) => s.id === q.supplierId || !quotes.some((x) => x.supplierId === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
                <Input
                  aria-label="Quoted price"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Price"
                  value={q.quotedPrice}
                  onChange={(e) => setQuotes((all) => all.map((x, j) => (j === i ? { ...x, quotedPrice: e.target.value } : x)))}
                />
                <Input
                  aria-label="Minimum order quantity"
                  type="number"
                  min={1}
                  placeholder="MOQ"
                  value={q.moq}
                  onChange={(e) => setQuotes((all) => all.map((x, j) => (j === i ? { ...x, moq: e.target.value } : x)))}
                />
                <IconButton label="Remove quote" onClick={() => setQuotes((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
