"use client";

import * as React from "react";
import { createComplianceItemRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type ComplianceItemDto, createItem } from "@/lib/api/certification";
import { FormError, FormField, RecordNumberField, describedBy, identifierOrAuto, toFieldErrors, type FieldErrors } from "@/components/common/artifact-form";
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
import { Textarea } from "@/components/ui/textarea";

export interface ItemFormDialogProps {
  projectId: string;
  basisId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: ComplianceItemDto) => void;
}

/**
 * Records a new compliance obligation. No applicability, method or
 * disposition field here — every new item starts UNDETERMINED/UNASSESSED,
 * because those are judgements a reviewer makes deliberately, not defaults
 * chosen at creation time.
 */
export function ItemFormDialog({ projectId, basisId, open, onOpenChange, onSaved }: ItemFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New compliance item</DialogTitle>
          <DialogDescription>
            One certification obligation. Applicability, method and disposition are recorded
            afterward, on the detail page.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start blank — no reset effect. */}
        {open && (
          <ItemFormBody
            projectId={projectId}
            basisId={basisId}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemFormBody({
  projectId,
  basisId,
  onCancel,
  onSaved,
}: {
  projectId: string;
  basisId: string;
  onCancel: () => void;
  onSaved: (item: ComplianceItemDto) => void;
}) {
  const [identifier, setIdentifier] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const description_ = description.trim() === "" ? null : description;
    const parsed = createComplianceItemRequestSchema.safeParse({ identifier: identifierOrAuto(identifier), title, description: description_ });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);
    try {
      const saved = await createItem(projectId, parsed.data, basisId);
      onSaved(saved);
    } catch (error) {
      setFormError(describeApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {formError && <FormError message={formError} />}
        <RecordNumberField
          id="item-identifier"
          prefix="CI"
          value={identifier}
          onChange={setIdentifier}
          error={fieldErrors["identifier"]}
          disabled={isSubmitting}
        />
        <FormField id="item-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="item-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("item-title", fieldErrors["title"])}
          />
        </FormField>
        <FormField id="item-description" label="Description" error={fieldErrors["description"]}>
          <Textarea
            id="item-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy("item-description", fieldErrors["description"])}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Create item"}
        </Button>
      </DialogFooter>
    </form>
  );
}
