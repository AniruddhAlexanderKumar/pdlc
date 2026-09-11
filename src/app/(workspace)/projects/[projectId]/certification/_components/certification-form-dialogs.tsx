"use client";

import * as React from "react";
import {
  createCertificationBasisRequestSchema,
  createCertificationProgramRequestSchema,
  updateCertificationBasisRequestSchema,
  updateCertificationProgramRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type CertificationBasisDto,
  type CertificationProgramDto,
  createBasis,
  createProgram,
  updateBasis,
  updateProgram,
} from "@/lib/api/certification";
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
import { Textarea } from "@/components/ui/textarea";

// --- Certification programme --------------------------------------------

export interface ProgramFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  program?: CertificationProgramDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (program: CertificationProgramDto) => void;
}

/**
 * Create/edit the project's single internal certification programme.
 *
 * There is no "certified" state anywhere in this form — status is DRAFT,
 * ACTIVE, ON_HOLD or CLOSED, none of which is a regulatory claim.
 */
export function ProgramFormDialog({
  mode,
  projectId,
  program,
  open,
  onOpenChange,
  onSaved,
}: ProgramFormDialogProps) {
  const isCreate = mode === "create";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create certification programme" : "Edit certification programme"}</DialogTitle>
          <DialogDescription>
            An internal certification effort for this project — not a claim of external
            regulatory approval.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start fresh — no reset effect. */}
        {open && (
          <ProgramFormBody
            isCreate={isCreate}
            projectId={projectId}
            program={program}
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

function ProgramFormBody({
  isCreate,
  projectId,
  program,
  onCancel,
  onSaved,
}: {
  isCreate: boolean;
  projectId: string;
  program?: CertificationProgramDto;
  onCancel: () => void;
  onSaved: (program: CertificationProgramDto) => void;
}) {
  const [identifier, setIdentifier] = React.useState(program?.identifier ?? "");
  const [name, setName] = React.useState(program?.name ?? "");
  const [description, setDescription] = React.useState(program?.description ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const description_ = description.trim() === "" ? null : description;

    const parsed = isCreate
      ? createCertificationProgramRequestSchema.safeParse({ identifier, name, description: description_ })
      : updateCertificationProgramRequestSchema.safeParse({ name, description: description_ });

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);
    try {
      const saved = isCreate
        ? await createProgram(projectId, parsed.data as never)
        : await updateProgram(projectId, parsed.data as never);
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
        {isCreate && (
          <FormField id="program-identifier" label="Identifier" required error={fieldErrors["identifier"]}>
            <Input
              id="program-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="CERT-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy("program-identifier", fieldErrors["identifier"])}
            />
          </FormField>
        )}
        <FormField id="program-name" label="Name" required error={fieldErrors["name"]}>
          <Input
            id="program-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors["name"] ? true : undefined}
            aria-describedby={describedBy("program-name", fieldErrors["name"])}
          />
        </FormField>
        <FormField id="program-description" label="Description" error={fieldErrors["description"]}>
          <Textarea
            id="program-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy("program-description", fieldErrors["description"])}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create programme" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// --- Certification basis --------------------------------------------------

export interface BasisFormDialogProps {
  projectId: string;
  basis?: CertificationBasisDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (basis: CertificationBasisDto) => void;
}

/**
 * Create/edit a certification basis while it is DRAFT.
 *
 * `sourceReference` is a document/authority locator — never the text of a
 * regulation, which this system does not store.
 */
export function BasisFormDialog({ projectId, basis, open, onOpenChange, onSaved }: BasisFormDialogProps) {
  const isCreate = !basis;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Record certification basis" : "Edit certification basis"}</DialogTitle>
          <DialogDescription>
            The certification standard/basis being tracked. `sourceReference` is a document or
            authority locator, not the text of the regulation.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start fresh — no reset effect. */}
        {open && (
          <BasisFormBody
            isCreate={isCreate}
            projectId={projectId}
            basis={basis}
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

function BasisFormBody({
  isCreate,
  projectId,
  basis,
  onCancel,
  onSaved,
}: {
  isCreate: boolean;
  projectId: string;
  basis?: CertificationBasisDto;
  onCancel: () => void;
  onSaved: (basis: CertificationBasisDto) => void;
}) {
  const [identifier, setIdentifier] = React.useState(basis?.identifier ?? "");
  const [title, setTitle] = React.useState(basis?.title ?? "");
  const [description, setDescription] = React.useState(basis?.description ?? "");
  const [revision, setRevision] = React.useState(basis?.revision ?? "");
  const [sourceReference, setSourceReference] = React.useState(basis?.sourceReference ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const description_ = description.trim() === "" ? null : description;
    const sourceReference_ = sourceReference.trim() === "" ? null : sourceReference;

    const parsed = isCreate
      ? createCertificationBasisRequestSchema.safeParse({
          identifier,
          title,
          description: description_,
          revision,
          sourceReference: sourceReference_,
        })
      : updateCertificationBasisRequestSchema.safeParse({
          title,
          description: description_,
          revision,
          sourceReference: sourceReference_,
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
        isCreate || !basis
          ? await createBasis(projectId, parsed.data as never)
          : await updateBasis(projectId, basis.id, parsed.data as never);
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
        {isCreate && (
          <FormField id="basis-identifier" label="Identifier" required error={fieldErrors["identifier"]}>
            <Input
              id="basis-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="CB-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy("basis-identifier", fieldErrors["identifier"])}
            />
          </FormField>
        )}
        <FormField id="basis-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="basis-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("basis-title", fieldErrors["title"])}
          />
        </FormField>
        <FormField id="basis-revision" label="Revision" required error={fieldErrors["revision"]} hint="e.g. Amdt 25-141.">
          <Input
            id="basis-revision"
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors["revision"] ? true : undefined}
            aria-describedby={describedBy("basis-revision", fieldErrors["revision"], "hint")}
          />
        </FormField>
        <FormField
          id="basis-source-reference"
          label="Source reference"
          error={fieldErrors["sourceReference"]}
          hint="A document or authority reference, not the regulation's text."
        >
          <Input
            id="basis-source-reference"
            value={sourceReference}
            onChange={(event) => setSourceReference(event.target.value)}
            disabled={isSubmitting}
            aria-describedby={describedBy("basis-source-reference", fieldErrors["sourceReference"], "hint")}
          />
        </FormField>
        <FormField id="basis-description" label="Description" error={fieldErrors["description"]}>
          <Textarea
            id="basis-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy("basis-description", fieldErrors["description"])}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Record basis" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
