"use client";

import * as React from "react";
import {
  SUPPLIER_STATUSES,
  createSupplierRequestSchema,
  updateSupplierRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type SupplierDetailDto,
  type SupplierDto,
  createSupplier,
  updateSupplier,
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

export interface SupplierFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  supplier?: SupplierDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (supplier: SupplierDto) => void;
}

/**
 * Create/edit form for a supplier.
 *
 * Engineering fields only. There is no contract, no commercial contact, no
 * rating and no procurement state, because this record exists to answer "what
 * does the product depend on this organization for?" and nothing else.
 */
export function SupplierFormDialog({
  mode,
  projectId,
  supplier,
  open,
  onOpenChange,
  onSaved,
}: SupplierFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New supplier" : "Edit supplier"}</DialogTitle>
          <DialogDescription>
            An external organization this project&rsquo;s engineering depends on. Record what they
            supply as supplied items.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          supplier={supplier}
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
  supplier,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  supplier?: SupplierDetailDto;
  onCancel: () => void;
  onSaved: (supplier: SupplierDto) => void;
}) {
  const isCreate = mode === "create";

  const [identifier, setIdentifier] = React.useState(supplier?.identifier ?? "");
  const [name, setName] = React.useState(supplier?.name ?? "");
  const [description, setDescription] = React.useState(supplier?.description ?? "");
  const [status, setStatus] = React.useState(supplier?.status ?? "ACTIVE");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const description_ = description.trim() === "" ? null : description;

    const parsed = isCreate
      ? createSupplierRequestSchema.safeParse({ identifier: identifierOrAuto(identifier), name, description: description_ })
      : updateSupplierRequestSchema.safeParse({ name, description: description_, status });

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
        isCreate || !supplier
          ? await createSupplier(projectId, parsed.data as never)
          : await updateSupplier(projectId, supplier.id, parsed.data as never);
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
          <RecordNumberField
            id="supplier-identifier"
            prefix="SUP"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <FormField id="supplier-name" label="Name" required error={fieldErrors["name"]}>
          <Input
            id="supplier-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            placeholder="Vulcan Alloys Ltd"
            aria-invalid={fieldErrors["name"] ? true : undefined}
            aria-describedby={describedBy("supplier-name", fieldErrors["name"])}
          />
        </FormField>

        <FormField
          id="supplier-description"
          label="Description"
          error={fieldErrors["description"]}
          hint="What this project depends on them for."
        >
          <Textarea
            id="supplier-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy(
              "supplier-description",
              fieldErrors["description"],
              "hint",
            )}
          />
        </FormField>

        {!isCreate && (
          <FormField
            id="supplier-status"
            label="Status"
            hint="Independent of any qualification. Changing this never alters a qualification's state."
          >
            <Select
              id="supplier-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              disabled={isSubmitting}
              aria-describedby={describedBy("supplier-status", undefined, "hint")}
            >
              {SUPPLIER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {supplierLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create supplier" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
