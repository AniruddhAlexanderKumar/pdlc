"use client";

import * as React from "react";
import {
  DESIGN_ITEM_STATUSES,
  DESIGN_ITEM_TYPES,
  createDesignItemRequestSchema,
  updateDesignItemRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type DesignItemDetailDto,
  type DesignItemDto,
  createDesignItem,
  updateDesignItem,
} from "@/lib/api/artifacts";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { artifactLabel } from "@/components/common/artifact-badges";
import {
  type FieldErrors,
  FormError,
  FormField,
  describedBy,
  toFieldErrors,
} from "@/components/common/artifact-form";
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

export interface DesignItemFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  designItem?: DesignItemDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (designItem: DesignItemDto) => void;
}

/**
 * Create/edit form for a design item. Owner is offered on create only —
 * afterwards it has its own audited endpoint on the detail page.
 */
export function DesignItemFormDialog({
  mode,
  projectId,
  designItem,
  open,
  onOpenChange,
  onSaved,
}: DesignItemFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New design item" : "Edit design item"}</DialogTitle>
          <DialogDescription>
            A system, subsystem, assembly, component or software element that requirements can be
            allocated to.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          designItem={designItem}
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
  designItem,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  designItem?: DesignItemDetailDto;
  onCancel: () => void;
  onSaved: (designItem: DesignItemDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(designItem?.identifier ?? "");
  const [name, setName] = React.useState(designItem?.name ?? "");
  const [description, setDescription] = React.useState(designItem?.description ?? "");
  const [itemType, setItemType] = React.useState(designItem?.itemType ?? "COMPONENT");
  const [status, setStatus] = React.useState(designItem?.status ?? "DRAFT");
  const [ownerId, setOwnerId] = React.useState(designItem?.ownerId ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const description_ = description.trim() === "" ? null : description;

    const parsed = isCreate
      ? createDesignItemRequestSchema.safeParse({
          identifier,
          name,
          description: description_,
          itemType,
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateDesignItemRequestSchema.safeParse({
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
        isCreate || !designItem
          ? await createDesignItem(projectId, parsed.data as never)
          : await updateDesignItem(projectId, designItem.id, parsed.data as never);
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
          <FormField
            id="design-identifier"
            label="Identifier"
            required
            error={fieldErrors["identifier"]}
            hint="Project-scoped key, e.g. DI-001."
          >
            <Input
              id="design-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="DI-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy("design-identifier", fieldErrors["identifier"], "hint")}
            />
          </FormField>
        )}

        <FormField id="design-name" label="Name" required error={fieldErrors["name"]}>
          <Input
            id="design-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            placeholder="Combustion chamber"
            aria-invalid={fieldErrors["name"] ? true : undefined}
            aria-describedby={describedBy("design-name", fieldErrors["name"])}
          />
        </FormField>

        <FormField id="design-description" label="Description" error={fieldErrors["description"]}>
          <Textarea
            id="design-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="design-item-type" label="Item type" required>
            <Select
              id="design-item-type"
              value={itemType}
              onChange={(event) => setItemType(event.target.value as typeof itemType)}
              disabled={isSubmitting}
            >
              {DESIGN_ITEM_TYPES.map((value) => (
                <option key={value} value={value}>
                  {artifactLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>

          {isCreate ? (
            <FormField id="design-owner" label="Owner">
              <Select
                id="design-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                disabled={isSubmitting || members.state.phase !== "ready"}
              >
                <option value="">Unassigned</option>
                {members.state.phase === "ready" &&
                  members.state.data.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.email})
                    </option>
                  ))}
              </Select>
            </FormField>
          ) : (
            <FormField id="design-status" label="Status">
              <Select
                id="design-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                disabled={isSubmitting}
              >
                {DESIGN_ITEM_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {artifactLabel(value)}
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
          {isSubmitting ? "Saving…" : isCreate ? "Create design item" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
