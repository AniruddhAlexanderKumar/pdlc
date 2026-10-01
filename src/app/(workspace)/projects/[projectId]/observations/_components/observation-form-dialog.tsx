"use client";

import * as React from "react";
import {
  OBSERVATION_SUBJECT_TYPES,
  OBSERVATION_TYPES,
  type ObservationSubjectType,
  createObservationRequestSchema,
  updateObservationRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type ObservationDto, createObservation, updateObservation } from "@/lib/api/drift";
import { useBaselineMemberTargets } from "@/lib/api/drift";
import { FormError, FormField, RecordNumberField, describedBy, identifierOrAuto, toFieldErrors, type FieldErrors } from "@/components/common/artifact-form";
import { driftLabel } from "@/components/common/drift-badges";
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

export interface ObservationFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  observation?: ObservationDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (observation: ObservationDto) => void;
}

/**
 * Create/edit form for an operational observation.
 *
 * Two things it deliberately does not offer:
 *
 *  - **An expected value.** The expectation lives on the engineering side, on a
 *    `DecisionExpectation`. Recording it again here would create two versions of
 *    the same claim that could disagree invisibly.
 *  - **A status.** An observation is created as RECORDED and moved by an
 *    explicit review or rejection, because accepting somebody's report as
 *    engineering evidence is a determination, not a dropdown.
 */
export function ObservationFormDialog({
  mode,
  projectId,
  observation,
  open,
  onOpenChange,
  onSaved,
}: ObservationFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Record observation" : "Edit observation"}</DialogTitle>
          <DialogDescription>
            Something actually observed in operation. Recording it does not make it engineering
            evidence — an engineer reviews it before drift compares anything against it.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          observation={observation}
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
  observation,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  observation?: ObservationDto;
  onCancel: () => void;
  onSaved: (observation: ObservationDto) => void;
}) {
  const isCreate = mode === "create";
  const targets = useBaselineMemberTargets(projectId);

  const [identifier, setIdentifier] = React.useState(observation?.identifier ?? "");
  const [title, setTitle] = React.useState(observation?.title ?? "");
  const [description, setDescription] = React.useState(observation?.description ?? "");
  const [observationType, setObservationType] = React.useState(
    observation?.observationType ?? "MEASUREMENT",
  );
  const [source, setSource] = React.useState(observation?.source ?? "");
  const [observedAt, setObservedAt] = React.useState(
    toDateInput(observation?.observedAt) || new Date().toISOString().slice(0, 10),
  );
  const [subjectType, setSubjectType] = React.useState<ObservationSubjectType | "">(
    (observation?.subject?.type as ObservationSubjectType | undefined) ?? "",
  );
  const [subjectId, setSubjectId] = React.useState(observation?.subject?.id ?? "");
  const [numericValue, setNumericValue] = React.useState(observation?.numericValue ?? "");
  const [unit, setUnit] = React.useState(observation?.unit ?? "");
  const [textValue, setTextValue] = React.useState(observation?.textValue ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // The baseline-target lookup already returns every subject type an
  // observation may name, so nothing new is fetched for this form.
  const subjectOptions = React.useMemo(() => {
    if (targets.state.phase !== "ready" || subjectType === "") return [];
    return targets.state.data[subjectType] ?? [];
  }, [targets.state, subjectType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const optional = (value: string) => (value.trim() === "" ? null : value.trim());

    const parsed = isCreate
      ? createObservationRequestSchema.safeParse({
          identifier: identifierOrAuto(identifier),
          title,
          description,
          observationType,
          source: optional(source),
          observedAt: new Date(observedAt).toISOString(),
          subject: subjectType && subjectId ? { type: subjectType, id: subjectId } : null,
          numericValue: optional(numericValue),
          unit: optional(unit),
          textValue: optional(textValue),
        })
      : updateObservationRequestSchema.safeParse({
          title,
          description,
          observationType,
          source: optional(source),
          observedAt: new Date(observedAt).toISOString(),
          numericValue: optional(numericValue),
          unit: optional(unit),
          textValue: optional(textValue),
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
        isCreate || !observation
          ? await createObservation(projectId, parsed.data as never)
          : await updateObservation(projectId, observation.id, parsed.data as never);
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
            id="obs-identifier"
            prefix="OBS"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <FormField id="obs-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="obs-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Peak chamber wall temperature, flight 14"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("obs-title", fieldErrors["title"])}
          />
        </FormField>

        <FormField
          id="obs-description"
          label="Description"
          required
          error={fieldErrors["description"]}
        >
          <Textarea
            id="obs-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy("obs-description", fieldErrors["description"])}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="obs-type" label="Observation type" required>
            <Select
              id="obs-type"
              value={observationType}
              onChange={(event) =>
                setObservationType(event.target.value as typeof observationType)
              }
              disabled={isSubmitting}
            >
              {OBSERVATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {driftLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            id="obs-observed-at"
            label="Observed on"
            required
            error={fieldErrors["observedAt"]}
          >
            <Input
              id="obs-observed-at"
              type="date"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
              disabled={isSubmitting}
              aria-describedby={describedBy("obs-observed-at", fieldErrors["observedAt"])}
            />
          </FormField>
        </div>

        {isCreate && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="obs-subject-type"
              label="Concerns"
              hint="Optional. A report that does not yet name what it concerns is still a real record."
            >
              <Select
                id="obs-subject-type"
                value={subjectType}
                onChange={(event) => {
                  setSubjectType(event.target.value as ObservationSubjectType | "");
                  setSubjectId("");
                }}
                disabled={isSubmitting}
                aria-describedby={describedBy("obs-subject-type", undefined, "hint")}
              >
                <option value="">Nothing specific</option>
                {OBSERVATION_SUBJECT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {driftLabel(value)}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="obs-subject" label="Object">
              <Select
                id="obs-subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={isSubmitting || subjectType === "" || subjectOptions.length === 0}
              >
                <option value="">
                  {subjectType === ""
                    ? "Select a type first"
                    : subjectOptions.length === 0
                      ? "None recorded in this project"
                      : "Select…"}
                </option>
                {subjectOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.identifier} — {option.title}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="obs-numeric"
            label="Measured value"
            error={fieldErrors["numericValue"]}
            hint="An exact decimal, e.g. 842.5. Compared exactly — never through a float."
          >
            <Input
              id="obs-numeric"
              value={numericValue}
              onChange={(event) => setNumericValue(event.target.value)}
              disabled={isSubmitting}
              placeholder="842.5"
              className="font-mono"
              aria-invalid={fieldErrors["numericValue"] ? true : undefined}
              aria-describedby={describedBy("obs-numeric", fieldErrors["numericValue"], "hint")}
            />
          </FormField>

          <FormField
            id="obs-unit"
            label="Unit"
            error={fieldErrors["unit"]}
            hint="Must match the expectation's unit exactly. Nothing is converted."
          >
            <Input
              id="obs-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              disabled={isSubmitting}
              placeholder="K"
              aria-describedby={describedBy("obs-unit", fieldErrors["unit"], "hint")}
            />
          </FormField>
        </div>

        <FormField
          id="obs-text"
          label="Text value"
          error={fieldErrors["textValue"]}
          hint="For observations that are not numeric, e.g. an as-found configuration."
        >
          <Input
            id="obs-text"
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            disabled={isSubmitting}
            aria-describedby={describedBy("obs-text", fieldErrors["textValue"], "hint")}
          />
        </FormField>

        <FormField id="obs-source" label="Source" error={fieldErrors["source"]}>
          <Input
            id="obs-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={isSubmitting}
            placeholder="Flight test report FT-14"
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Record observation" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
