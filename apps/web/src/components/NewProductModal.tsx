import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles } from 'lucide-react';
import { XP } from '@sv/shared';
import { useCreateProduct } from '../api/hooks';
import { useMoney } from '../lib/money';
import { Button, Field, Input, Modal } from './ui';

/** Step one of "Tell us": just a name. The question deck takes it from there. */
export function NewProductModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateProduct();
  const { symbol } = useMoney();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), category: category.trim() || undefined, targetSellingPrice: price === '' ? undefined : Number(price) },
      {
        onSuccess: (res) => {
          onClose();
          navigate(`/products/${res.data.id}/discover`);
        }
      }
    );
  };

  return (
    <Modal
      title="New product"
      subtitle="Start with a name. We'll ask a few quick questions next."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name.trim()} icon={<Sparkles className="h-4 w-4" />}>
            Create · +{XP.productCreated} XP
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
        <Field label="What are you building?" htmlFor="np-name">
          <Input id="np-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coral Steel Water Bottle" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category (optional)" htmlFor="np-cat">
            <Input id="np-cat" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Drinkware" />
          </Field>
          <Field label="Selling price (optional)" htmlFor="np-price">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{symbol}</span>
              <Input id="np-price" type="number" min={0} step="any" className="pl-8" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
