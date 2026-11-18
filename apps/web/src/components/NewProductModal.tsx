import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useCreateProduct, useSession } from '../api/hooks';
import { Button, Modal } from './ui';
import { ProductStartFields, startValues } from './journey/ProductStartFields';

export function NewProductModal({ onClose }: { onClose: () => void }) {
  const me = useSession(),
    navigate = useNavigate(),
    create = useCreateProduct();
  const [form, setForm] = useState(() => startValues(me.user.guideMode));
  return (
    <Modal
      title="Let’s build your product"
      subtitle={`Start with what you know. This is a ${me.workspace.mode === 'team' ? 'team' : 'personal'} workspace.`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-product" disabled={!form.name.trim()} loading={create.isPending}>
            Start my journey <ArrowRight size={15} />
          </Button>
        </>
      }
    >
      <form
        id="new-product"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(form, {
            onSuccess: (res) => {
              onClose();
              navigate(`/products/${res.data.id}/discover?stage=${res.data.stage}`);
            }
          });
        }}
      >
        <ProductStartFields value={form} onChange={setForm} />
        {create.isError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {create.error.message}
          </p>
        )}
      </form>
    </Modal>
  );
}
