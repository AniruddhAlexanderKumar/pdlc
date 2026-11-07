"use client";

import * as React from "react";
import {
  SUPPLIER_QUALIFICATION_STATUSES,
  SUPPLIER_QUALIFICATION_TYPES,
  createSupplierQualificationRequestSchema,
  updateSupplierQualificationRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type QualificationDetailDto,
  type QualificationDto,
  createQualification,
  updateQualification,
  useSuppliedItems,
  useSuppliers,
} from "@/lib/api/suppliers";
import {
  type FieldErrors,
  FormError,
  FormField,
  describedBy,
  toFieldErrors,
} from "@/components/common/artifact-form";
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

export interface QualificationFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  supplierId?: string;
  suppliedItemId?: string;
  qualification?: QualificationDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (qualification: QualificationDto) => void;
}

/**
 * Create/edit form for a supplier qualification.
 *
 * Two things this form deliberately does not do:
 *
 *  - **It does not derive status.** Entering an expiry date in the past leaves
 *    the status exactly where it is. Moving a qualification to EXPIRED is an
 *    engineering judgement someone records, not a consequence of a clock.
 *  - **It does not name a standard or an authority.** This is engineering
 *    context, not certification; compliance semantics belong to a capability
 *    that does not exist yet.
 */
export function QualificationFormDialog({
  mode,
  projectId,
  supplierId,
  suppliedItemId,
  qualification,
  open,
  onOpenChange,
  onSaved,
}: QualificationFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New qualification" : "Edit qualification"}</DialogTitle>
          <DialogDescription>
            What establishes that this supplier, or something they supply, is suitable for a defined
            engineering purpose. Not a certification record.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          supplierId={supplierId}
          suppliedItemId={suppliedItemId}
          qualification={qualification}
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

/** `2026-01-31T00:00:00.000Z` → `2026-01-31`, for a date input. */
function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function FormBody({
  mode,
  projectId,
  supplierId,
  suppliedItemId,
  qualification,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  supplierId?: string;
  suppliedItemId?: string;
  qualification?: QualificationDetailDto;
  onCancel: () => void;
  onSaved: (qualification: QualificationDto) => void;
}) {
  const isCreate = mode === "create";
  const suppliers = useSuppliers(projectId);

  const [selectedSupplier, setSelectedSupplier] = React.useState(
    supplierId ?? qualification?.supplierId ?? "",
  );
  const [selectedItem, setSelectedItem] = React.useState(
    suppliedItemId ?? qualification?.suppliedItemId ?? "",
  );

  // Only the chosen supplier's items may be selected — the server enforces the
  // same rule, and offering others would invite a rejection the user could have
  // been spared.
  const items = useSuppliedItems(
    projectId,
    selectedSupplier ? { supplierId: selectedSupplier } : {},
  );

  const [title, setTitle] = React.useState(qualification?.title ?? "");
  const [qualificationType, setQualificationType] = React.useState(
    qualification?.qualificationType ?? "SOURCE",
  );
  const [status, setStatus] = React.useState(qualification?.status ?? "PLANNED");
  const [evidenceReference, setEvidenceReference] = React.useState(
    qualification?.evidenceReference ?? "",
  );
  const [effectiveDate, setEffectiveDate] = React.useState(
    toDateInput(qualification?.effectiveDate),
  );
  const [expiryDate, setExpiryDate] = React.useState(toDateInput(qualification?.expiryDate));

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const reference = evidenceReference.trim() === "" ? null : evidenceReference.trim();
    const effective = effectiveDate === "" ? null : new Date(effectiveDate).toISOString();
    const expiry = expiryDate === "" ? null : new Date(expiryDate).toISOString();

    const parsed = isCreate
      ? createSupplierQualificationRequestSchema.safeParse({
          supplierId: selectedSupplier,
          suppliedItemId: selectedItem === "" ? null : selectedItem,
          title,
          qualificationType,
          evidenceReference: reference,
          effectiveDate: effective,
          expiryDate: expiry,
        })
      : updateSupplierQualificationRequestSchema.safeParse({
          title,
          qualificationType,
          status,
          evidenceReference: reference,
          effectiveDate: effective,
          expiryDate: expiry,
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
        isCreate || !qualification
          ? await createQualification(projectId, parsed.data as never)
          : await updateQualification(projectId, qualification.id, parsed.data as never);
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
              id="qual-supplier"
              label="Supplier"
              required
              error={fieldErrors["supplierId"]}
            >
              <Select
                id="qual-supplier"
                value={selectedSupplier}
                onChange={(event) => {
                  setSelectedSupplier(event.target.value);
                  // The previously chosen item belonged to a different supplier.
                  setSelectedItem("");
                }}
                disabled={isSubmitting || suppliers.state.phase !== "ready"}
                aria-invalid={fieldErrors["supplierId"] ? true : undefined}
                aria-describedby={describedBy("qual-supplier", fieldErrors["supplierId"])}
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

            <FormField
              id="qual-item"
              label="Supplied item"
              error={fieldErrors["suppliedItemId"]}
              hint="Leave empty for a source qualification, which qualifies the supplier rather than any one item."
            >
              <Select
                id="qual-item"
                value={selectedItem}
                onChange={(event) => setSelectedItem(event.target.value)}
                disabled={isSubmitting || !selectedSupplier || items.state.phase !== "ready"}
                aria-describedby={describedBy("qual-item", fieldErrors["suppliedItemId"], "hint")}
              >
                <option value="">No specific item (source qualification)</option>
                {items.state.phase === "ready" &&
                  items.state.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.identifier} — {item.name}
                    </option>
                  ))}
              </Select>
            </FormField>
          </>
        )}

        <FormField id="qual-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="qual-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Vacuum brazing process qualification"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("qual-title", fieldErrors["title"])}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="qual-type" label="Qualification type" required>
            <Select
              id="qual-type"
              value={qualificationType}
              onChange={(event) =>
                setQualificationType(event.target.value as typeof qualificationType)
              }
              disabled={isSubmitting}
            >
              {SUPPLIER_QUALIFICATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {supplierLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>

          {!isCreate && (
            <FormField
              id="qual-status"
              label="Status"
              hint="Recorded by you. Nothing derives this from the expiry date."
            >
              <Select
                id="qual-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                disabled={isSubmitting}
                aria-describedby={describedBy("qual-status", undefined, "hint")}
              >
                {SUPPLIER_QUALIFICATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {supplierLabel(value)}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>

        <FormField
          id="qual-reference"
          label="Evidence reference"
          error={fieldErrors["evidenceReference"]}
          hint="An external locator. No file is stored; attach real Evidence records from the detail page."
        >
          <Input
            id="qual-reference"
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
            disabled={isSubmitting}
            placeholder="QMS-2026-114"
            aria-describedby={describedBy(
              "qual-reference",
              fieldErrors["evidenceReference"],
              "hint",
            )}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="qual-effective" label="Effective date" error={fieldErrors["effectiveDate"]}>
            <Input
              id="qual-effective"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            id="qual-expiry"
            label="Expiry date"
            error={fieldErrors["expiryDate"]}
            hint="Recorded, not enforced."
          >
            <Input
              id="qual-expiry"
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              disabled={isSubmitting}
              aria-describedby={describedBy("qual-expiry", fieldErrors["expiryDate"], "hint")}
            />
          </FormField>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create qualification" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
