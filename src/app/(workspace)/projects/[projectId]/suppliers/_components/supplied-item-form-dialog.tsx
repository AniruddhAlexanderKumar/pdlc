"use client";

import * as React from "react";
import {
  SUPPLIED_ITEM_STATUSES,
  SUPPLIED_ITEM_TYPES,
  createSuppliedItemRequestSchema,
  updateSuppliedItemRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type SuppliedItemDetailDto,
  type SuppliedItemDto,
  createSuppliedItem,
  updateSuppliedItem,
  useSuppliers,
} from "@/lib/api/suppliers";
import { FormError, FormField, RecordNumberField, describedBy, identifierOrAuto, toFieldErrors, type FieldErrors } from "@/components/common/artifact-form";
import { supplierLabel } from "@/components/common/supplier-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface SuppliedItemFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Preselects the supplier when created from a supplier's own page. */
  supplierId?: string;
  suppliedItem?: SuppliedItemDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (suppliedItem: SuppliedItemDto) => void;
}

/**
 * Create/edit form for a supplied item.
 *
 * The supplier is chosen on create only. Re-parenting an item afterwards would
 * silently rewrite what every engineering link on it means, so the edit form
 * does not offer it — a new item is recorded instead and the old one marked
 * OBSOLETE.
 */
export function SuppliedItemFormDialog({
  mode,
  projectId,
  supplierId,
  suppliedItem,
  open,
  onOpenChange,
  onSaved,
}: SuppliedItemFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New supplied item" : "Edit supplied item"}</DialogTitle>
          <DialogDescription>
            A part, material, process, service or software element a supplier provides. Link it to
            the design, requirements and verification that depend on it.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          supplierId={supplierId}
          suppliedItem={suppliedItem}
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onSaved(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  mode,
  projectId,
  supplierId,
  suppliedItem,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  supplierId?: string;
  suppliedItem?: SuppliedItemDetailDto;
  onCancel: () => void;
  onSaved: (suppliedItem: SuppliedItemDto) => void;
}) {
  const isCreate = mode === "create";
  const suppliers = useSuppliers(projectId);

  const [selectedSupplier, setSelectedSupplier] = React.useState(
    supplierId ?? suppliedItem?.supplierId ?? "",
  );
  const [identifier, setIdentifier] = React.useState(suppliedItem?.identifier ?? "");
  const [name, setName] = React.useState(suppliedItem?.name ?? "");
  const [description, setDescription] = React.useState(suppliedItem?.description ?? "");
  const [itemType, setItemType] = React.useState(suppliedItem?.itemType ?? "PART");
  const [status, setStatus] = React.useState(suppliedItem?.status ?? "ACTIVE");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const description_ = description.trim() === "" ? null : description;

    const parsed = isCreate
      ? createSuppliedItemRequestSchema.safeParse({
          supplierId: selectedSupplier,
          identifier: identifierOrAuto(identifier),
          name,
          description: description_,
          itemType,
        })
      : updateSuppliedItemRequestSchema.safeParse({
          name,
          description: description_,
          itemType,
          status,
        });

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved =
        isCreate || !suppliedItem
          ? await createSuppliedItem(projectId, parsed.data as never)
          : await updateSuppliedItem(projectId, suppliedItem.id, parsed.data as never);
      onSaved(saved);
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {formError && <FormError message={formError} />}

        {isCreate && (
          <>
            <FormField
              id="item-supplier"
              label="Supplier"
              required
              error={fieldErrors["supplierId"]}
              hint="Only suppliers recorded in this project. Chosen once — an item is not re-parented later."
            >
              <Select
                id="item-supplier"
                value={selectedSupplier}
                onChange={(event) => setSelectedSupplier(event.target.value)}
                disabled={isSubmitting || suppliers.state.phase !== "ready"}
                aria-invalid={fieldErrors["supplierId"] ? true : undefined}
                aria-describedby={describedBy("item-supplier", fieldErrors["supplierId"], "hint")}
              >
                <option value="">Select a supplier…</option>
                {suppliers.state.phase === "ready" &&
                  suppliers.state.data.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.identifier} — {supplier.name}
                    </option>
                  ))}
              </Select>
            </FormField>

            <RecordNumberField
              id="item-identifier"
              prefix="SI"
              value={identifier}
              onChange={setIdentifier}
              error={fieldErrors["identifier"]}
              disabled={isSubmitting}
            />
          </>
        )}

        <FormField id="item-name" label="Name" required error={fieldErrors["name"]}>
          <Input
            id="item-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            placeholder="Inconel 718 forging"
            aria-invalid={fieldErrors["name"] ? true : undefined}
            aria-describedby={describedBy("item-name", fieldErrors["name"])}
          />
        </FormField>

        <FormField id="item-description" label="Description" error={fieldErrors["description"]}>
          <Textarea
            id="item-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="item-type" label="Item type" required>
            <Select
              id="item-type"
              value={itemType}
              onChange={(event) => setItemType(event.target.value as typeof itemType)}
              disabled={isSubmitting}
            >
              {SUPPLIED_ITEM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {supplierLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>

          {!isCreate && (
            <FormField id="item-status" label="Status">
              <Select
                id="item-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                disabled={isSubmitting}
              >
                {SUPPLIED_ITEM_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {supplierLabel(value)}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create supplied item" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
