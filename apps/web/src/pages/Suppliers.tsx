import { useMemo, useState } from 'react';
import { Edit3, ExternalLink, Plus, Search, Trash2, Truck } from 'lucide-react';
import { XP, type Supplier, type WorkspaceData } from '@sv/shared';
import { useDeleteEntity, useSaveSupplier, useWorkspaceData } from '../api/hooks';
import { Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Spinner, Textarea, useConfirm } from '../components/ui';
import { useMoney } from '../lib/money';

function SupplierModal({ supplier, data, onClose }: { supplier: Supplier | null; data: WorkspaceData; onClose: () => void }) {
  const save = useSaveSupplier();
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    website: supplier?.website ?? '',
    contact: supplier?.contact ?? '',
    notes: supplier?.notes ?? ''
  });
  // Quotes this supplier gives, keyed by material.
  const [quotes, setQuotes] = useState<Record<string, { price: string; moq: string } | undefined>>(() => {
    const out: Record<string, { price: string; moq: string }> = {};
    if (supplier) {
      for (const m of data.materials) {
        const q = m.suppliers.find((s) => s.supplierId === supplier.id);
        if (q) out[m.id] = { price: String(q.quotedPrice), moq: q.moq === null ? '' : String(q.moq) };
      }
    }
    return out;
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () =>
    save.mutate(
      {
        id: supplier?.id,
        ...form,
        quotes: Object.entries(quotes)
          .filter((e): e is [string, { price: string; moq: string }] => Boolean(e[1]))
          .map(([materialId, q]) => ({ materialId, quotedPrice: Number(q.price) || 0, moq: q.moq === '' ? null : Math.max(1, Math.round(Number(q.moq))) }))
      },
      { onSuccess: onClose }
    );

  return (
    <Modal
      title={supplier ? 'Edit supplier' : 'New supplier'}
      subtitle={supplier ? undefined : `+${XP.supplierAdded} XP for every new supplier`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!form.name.trim()}>
            {supplier ? 'Save changes' : 'Add supplier'}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="s-name">
            <Input id="s-name" required maxLength={160} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Website" htmlFor="s-web">
            <Input id="s-web" type="url" value={form.website} onChange={set('website')} placeholder="https://" />
          </Field>
        </div>
        <Field label="Contact" htmlFor="s-contact">
          <Input id="s-contact" maxLength={500} value={form.contact} onChange={set('contact')} placeholder="Email, phone, person" />
        </Field>
        <Field label="Notes" htmlFor="s-notes">
          <Textarea id="s-notes" rows={2} maxLength={4000} value={form.notes} onChange={set('notes')} placeholder="Lead times, quality, payment terms" />
        </Field>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-sm font-medium">Quotes for library materials</p>
            <p className="text-xs text-zinc-500">Tick the materials this supplier can provide and enter their price.</p>
          </div>
          <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
            {data.materials.length === 0 && <p className="px-3 py-3 text-xs text-zinc-500">No materials in the library yet.</p>}
            {data.materials.map((m) => {
              const q = quotes[m.id];
              return (
                <div key={m.id} className="grid grid-cols-[auto_1fr_100px_80px] items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Quotes ${m.name}`}
                    checked={Boolean(q)}
                    onChange={(e) => setQuotes((all) => ({ ...all, [m.id]: e.target.checked ? { price: String(m.unitPrice), moq: '' } : undefined }))}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="truncate text-sm">{m.name}</span>
                  <Input
                    aria-label="Quoted price"
                    type="number"
                    min={0}
                    step="any"
                    disabled={!q}
                    value={q?.price ?? ''}
                    onChange={(e) => setQuotes((all) => ({ ...all, [m.id]: { price: e.target.value, moq: q?.moq ?? '' } }))}
                    className="py-1"
                  />
                  <Input
                    aria-label="MOQ"
                    type="number"
                    min={1}
                    placeholder="MOQ"
                    disabled={!q}
                    value={q?.moq ?? ''}
                    onChange={(e) => setQuotes((all) => ({ ...all, [m.id]: { price: q?.price ?? '', moq: e.target.value } }))}
                    className="py-1"
                  />
                </div>
              );
            })}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function SuppliersPage() {
  const { data, isLoading } = useWorkspaceData();
  const remove = useDeleteEntity('suppliers');
  const confirm = useConfirm();
  const { fmt } = useMoney();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ supplier: Supplier | null } | null>(null);

  const quotesBySupplier = useMemo(() => {
    const m = new Map<string, { name: string; price: number; unit: string; current: number }[]>();
    for (const mat of data?.materials ?? [])
      for (const q of mat.suppliers) m.set(q.supplierId, [...(m.get(q.supplierId) ?? []), { name: mat.name, price: q.quotedPrice, unit: mat.unit, current: mat.unitPrice }]);
    return m;
  }, [data]);

  if (isLoading || !data) return <Spinner />;
  const q = search.trim().toLowerCase();
  const list = data.suppliers.filter((s) => !q || `${s.name} ${s.contact} ${s.notes}`.toLowerCase().includes(q));

  const onDelete = async (s: Supplier) => {
    const n = quotesBySupplier.get(s.id)?.length ?? 0;
    if (
      await confirm({
        title: `Remove “${s.name}”?`,
        body: n ? `Their ${n} quote${n > 1 ? 's' : ''} will be removed. Materials are kept.` : 'This supplier has no quotes.',
        confirmLabel: 'Remove supplier',
        danger: true
      })
    )
      remove.mutate(s.id);
  };

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Who you buy from, and what they quote. Cheaper quotes become suggestions."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ supplier: null })}>
            New supplier
          </Button>
        }
      />
      <div className="space-y-4 px-4 py-5 md:px-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input aria-label="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers" className="pl-9" />
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<Truck className="h-6 w-6" />}
            title={data.suppliers.length ? 'Nothing matches' : 'No suppliers yet'}
            body={data.suppliers.length ? 'Try another search.' : 'Add the companies you buy materials from and record their quotes.'}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => {
              const quotes = quotesBySupplier.get(s.id) ?? [];
              return (
                <Card key={s.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{s.name}</h3>
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                          {s.website.replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex">
                      <IconButton label={`Edit ${s.name}`} onClick={() => setModal({ supplier: s })}>
                        <Edit3 className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Remove ${s.name}`} onClick={() => onDelete(s)} className="hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                  {s.contact && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{s.contact}</p>}
                  {s.notes && <p className="mt-1 text-xs text-zinc-500">{s.notes}</p>}
                  <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Quotes</p>
                    {quotes.length === 0 ? (
                      <p className="text-xs text-zinc-400">No quotes yet</p>
                    ) : (
                      <ul className="space-y-1">
                        {quotes.map((qt) => (
                          <li key={qt.name} className="flex justify-between gap-2 text-xs">
                            <span className="truncate text-zinc-600 dark:text-zinc-400">{qt.name}</span>
                            <span className={qt.price < qt.current ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'tabular-nums'}>
                              {fmt(qt.price)}/{qt.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {modal && <SupplierModal supplier={modal.supplier} data={data} onClose={() => setModal(null)} />}
    </>
  );
}
