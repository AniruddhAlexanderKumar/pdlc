import { useState } from 'react';
import type { Product } from '@sv/shared';
import { useUpdateProduct } from '../../api/hooks';
import { Button, Field, Input, Modal, Textarea } from '../../components/ui';
import { useMoney } from '../../lib/money';

export function EditProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const update = useUpdateProduct(product.id);
  const { symbol } = useMoney();
  const [form, setForm] = useState({
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.imageUrl,
    price: product.targetSellingPrice === null ? '' : String(product.targetSellingPrice)
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () =>
    update.mutate(
      {
        name: form.name.trim(),
        category: form.category.trim(),
        description: form.description,
        imageUrl: form.imageUrl.trim(),
        targetSellingPrice: form.price === '' ? null : Number(form.price)
      },
      { onSuccess: onClose }
    );

  return (
    <Modal
      title="Edit product"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={update.isPending} disabled={!form.name.trim()}>
            Save changes
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
        <Field label="Name" htmlFor="e-name">
          <Input id="e-name" required maxLength={120} value={form.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="e-cat">
            <Input id="e-cat" maxLength={60} value={form.category} onChange={set('category')} />
          </Field>
          <Field label="Selling price" htmlFor="e-price">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{symbol}</span>
              <Input id="e-price" type="number" min={0} step="any" className="pl-8" value={form.price} onChange={set('price')} placeholder="Not set" />
            </div>
          </Field>
        </div>
        <Field label="Description" htmlFor="e-desc">
          <Textarea id="e-desc" rows={3} maxLength={2000} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Image URL" htmlFor="e-img" hint="A link to a product photo (https://…).">
          <Input id="e-img" type="url" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
