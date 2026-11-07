"use client";

import * as React from "react";
import { GitCompareArrows, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { ASSUMPTION_STATUSES, COMPARISON_OPERATORS, EXPECTATION_STATUSES } from "@/domain";
import type { AssumptionStatus, ComparisonOperator, ExpectationStatus } from "@/domain";
import { comparisonOperatorSymbol } from "@/domain";
import type { AlternativeDto, AssumptionDto, ExpectationDto } from "@/lib/api/decisions";
import {
  AssumptionStatusBadge,
  ExpectationStatusBadge,
  assumptionStatusLabel,
  expectationStatusLabel,
} from "@/components/common/decision-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/lib/utils";

/**
 * The three structured memory sections: alternatives, assumptions and the
 * expectation.
 *
 * Each is presented so the reader can tell at a glance what the system knows
 * from what it merely recorded. Alternatives are visibly historical — options
 * that were rejected, not competing live choices. Assumption and expectation
 * states are always shown as words, and nothing here implies anything is being
 * monitored.
 */

// --- Alternatives -----------------------------------------------------------

export function AlternativesSection({
  alternatives,
  editable,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: {
  alternatives: AlternativeDto[];
  editable: boolean;
  busy: boolean;
  onAdd: (input: { title: string; description: string | null; reasonRejected: string | null }) => void;
  onUpdate: (
    id: string,
    input: { title: string; description: string | null; reasonRejected: string | null },
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-4" aria-hidden="true" />
            Alternatives considered
          </CardTitle>
          <CardDescription>
            Options that were weighed and <strong>not</strong> chosen. Historical context, not
            active choices.
          </CardDescription>
        </div>
        {editable && !isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} disabled={busy}>
            <Plus aria-hidden="true" />
            Add alternative
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {alternatives.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground">
            No alternatives recorded. If options were weighed, capturing them here is what lets a
            later reader see the decision was a choice rather than an accident.
          </p>
        )}

        {alternatives.map((alternative) =>
          editingId === alternative.id ? (
            <AlternativeForm
              key={alternative.id}
              initial={alternative}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSubmit={(input) => {
                onUpdate(alternative.id, input);
                setEditingId(null);
              }}
            />
          ) : (
            <article
              key={alternative.id}
              // Muted and dashed on purpose: a rejected option should never
              // read like the decision itself.
              className="flex items-start justify-between gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h4 className="text-sm font-medium text-foreground">{alternative.title}</h4>
                {alternative.description && (
                  <p className="text-sm text-muted-foreground">{alternative.description}</p>
                )}
                <p className="text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Rejected because:{" "}
                  </span>
                  <span className="text-foreground">
                    {alternative.reasonRejected ?? "No reason recorded."}
                  </span>
                </p>
              </div>
              {editable && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(alternative.id)}
                    disabled={busy}
                    aria-label={`Edit alternative ${alternative.title}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(alternative.id)}
                    disabled={busy}
                    aria-label={`Remove alternative ${alternative.title}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            </article>
          ),
        )}

        {isAdding && (
          <AlternativeForm
            busy={busy}
            onCancel={() => setIsAdding(false)}
            onSubmit={(input) => {
              onAdd(input);
              setIsAdding(false);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AlternativeForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial?: AlternativeDto;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    title: string;
    description: string | null;
    reasonRejected: string | null;
  }) => void;
}) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [reasonRejected, setReasonRejected] = React.useState(initial?.reasonRejected ?? "");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === "") {
          setError("A title is required");
          return;
        }
        onSubmit({
          title,
          description: description.trim() === "" ? null : description,
          reasonRejected: reasonRejected.trim() === "" ? null : reasonRejected,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alternative-title" required>
          Alternative
        </Label>
        <Input
          id="alternative-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
          placeholder="Ablative liner"
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alternative-description">Description</Label>
        <Textarea
          id="alternative-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alternative-reason">Reason rejected</Label>
        <Textarea
          id="alternative-reason"
          value={reasonRejected}
          onChange={(event) => setReasonRejected(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Mass and refurbishment cost."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {initial ? "Save alternative" : "Add alternative"}
        </Button>
      </div>
    </form>
  );
}

// --- Assumptions ------------------------------------------------------------

export function AssumptionsSection({
  assumptions,
  editable,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: {
  assumptions: AssumptionDto[];
  editable: boolean;
  busy: boolean;
  onAdd: (input: { statement: string; rationale: string | null }) => void;
  onUpdate: (id: string, input: { status: AssumptionStatus }) => void;
  onRemove: (id: string) => void;
}) {
  const [isAdding, setIsAdding] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>Assumptions</CardTitle>
          <CardDescription>
            What had to be true for this decision to hold. Tracked so they can be revisited —
            nothing checks them automatically, and a status only changes when someone records a
            finding.
          </CardDescription>
        </div>
        {editable && !isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} disabled={busy}>
            <Plus aria-hidden="true" />
            Add assumption
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {assumptions.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground">
            No assumptions recorded yet.
          </p>
        )}

        {assumptions.map((assumption) => (
          <article
            key={assumption.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm text-foreground">{assumption.statement}</p>
              {assumption.rationale && (
                <p className="text-sm text-muted-foreground">{assumption.rationale}</p>
              )}
              <AssumptionStatusBadge status={assumption.status} />
            </div>
            {editable && (
              <div className="flex shrink-0 items-center gap-2">
                <Label htmlFor={`assumption-status-${assumption.id}`} className="sr-only">
                  Status for {assumption.statement}
                </Label>
                <Select
                  id={`assumption-status-${assumption.id}`}
                  className="h-8 w-40"
                  value={assumption.status}
                  disabled={busy}
                  onChange={(event) =>
                    onUpdate(assumption.id, { status: event.target.value as AssumptionStatus })
                  }
                >
                  {ASSUMPTION_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {assumptionStatusLabel(value)}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(assumption.id)}
                  disabled={busy}
                  aria-label={`Remove assumption ${assumption.statement}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            )}
          </article>
        ))}

        {isAdding && (
          <AssumptionForm
            busy={busy}
            onCancel={() => setIsAdding(false)}
            onSubmit={(input) => {
              onAdd(input);
              setIsAdding(false);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AssumptionForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { statement: string; rationale: string | null }) => void;
}) {
  const [statement, setStatement] = React.useState("");
  const [rationale, setRationale] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (statement.trim() === "") {
          setError("An assumption statement is required");
          return;
        }
        onSubmit({ statement, rationale: rationale.trim() === "" ? null : rationale });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assumption-statement" required>
          Assumption
        </Label>
        <Textarea
          id="assumption-statement"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Coolant flow rate stays above 2.4 kg/s."
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Recorded as &ldquo;not checked&rdquo; until someone validates or invalidates it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assumption-rationale">Rationale</Label>
        <Textarea
          id="assumption-rationale"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          disabled={busy}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          Add assumption
        </Button>
      </div>
    </form>
  );
}

// --- Expectation ------------------------------------------------------------

export function ExpectationSection({
  expectation,
  editable,
  busy,
  onSet,
  onClear,
}: {
  expectation: ExpectationDto | null;
  editable: boolean;
  busy: boolean;
  onSet: (input: {
    statement: string;
    measure: string | null;
    expectedValue: string | null;
    unit: string | null;
    comparisonOperator: ComparisonOperator | null;
    status: ExpectationStatus;
    actualValue: string | null;
  }) => void;
  onClear: () => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" aria-hidden="true" />
            Expected consequence
          </CardTitle>
          <CardDescription>
            What this decision was expected to produce, and what was actually seen. The two are
            recorded separately and never inferred from each other.
          </CardDescription>
        </div>
        {editable && !isEditing && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} disabled={busy}>
              {expectation ? "Edit" : "Set expectation"}
            </Button>
            {expectation && (
              <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
                Clear
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <ExpectationForm
            initial={expectation}
            busy={busy}
            onCancel={() => setIsEditing(false)}
            onSubmit={(input) => {
              onSet(input);
              setIsEditing(false);
            }}
          />
        ) : !expectation ? (
          <p className="text-sm text-muted-foreground">
            No expectation recorded. Stating what should happen is what later makes it possible to
            tell whether it did.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-foreground">{expectation.statement}</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Expected and observed sit side by side, labelled, so the
                  difference between a prediction and a measurement is obvious. */}
              <section className="flex flex-col gap-2 rounded-md border border-border p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Expected
                </h4>
                <p className="font-mono text-sm text-foreground">
                  {expectation.comparisonOperator
                    ? `${comparisonOperatorSymbol(expectation.comparisonOperator)} `
                    : ""}
                  {expectation.expectedValue ?? "—"}
                  {expectation.unit ? ` ${expectation.unit}` : ""}
                </p>
                {expectation.measure && (
                  <p className="text-xs text-muted-foreground">Measure: {expectation.measure}</p>
                )}
                {!expectation.comparisonOperator && expectation.expectedValue && (
                  <p className="text-xs text-muted-foreground">
                    No comparison operator recorded — not mechanically comparable to an observation.
                  </p>
                )}
                {expectation.dueAt && (
                  <p className="text-xs text-muted-foreground">
                    Due {formatIsoDate(expectation.dueAt)}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2 rounded-md border border-border p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Observed
                </h4>
                <p className="font-mono text-sm text-foreground">
                  {expectation.actualValue ?? "Not yet observed"}
                  {expectation.actualValue && expectation.unit ? ` ${expectation.unit}` : ""}
                </p>
                <ExpectationStatusBadge status={expectation.status} />
                {expectation.observedAt && (
                  <p className="text-xs text-muted-foreground">
                    Observed {formatIsoDate(expectation.observedAt)}
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpectationForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: ExpectationDto | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    statement: string;
    measure: string | null;
    expectedValue: string | null;
    unit: string | null;
    comparisonOperator: ComparisonOperator | null;
    status: ExpectationStatus;
    actualValue: string | null;
  }) => void;
}) {
  const [statement, setStatement] = React.useState(initial?.statement ?? "");
  const [measure, setMeasure] = React.useState(initial?.measure ?? "");
  const [expectedValue, setExpectedValue] = React.useState(initial?.expectedValue ?? "");
  const [unit, setUnit] = React.useState(initial?.unit ?? "");
  const [comparisonOperator, setComparisonOperator] = React.useState<ComparisonOperator | "">(
    initial?.comparisonOperator ?? "",
  );
  const [actualValue, setActualValue] = React.useState(initial?.actualValue ?? "");
  const [status, setStatus] = React.useState<ExpectationStatus>(initial?.status ?? "NOT_OBSERVED");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (statement.trim() === "") {
          setError("An expectation statement is required");
          return;
        }
        onSubmit({
          statement,
          measure: measure.trim() === "" ? null : measure,
          expectedValue: expectedValue.trim() === "" ? null : expectedValue,
          unit: unit.trim() === "" ? null : unit,
          comparisonOperator: comparisonOperator === "" ? null : comparisonOperator,
          status,
          actualValue: actualValue.trim() === "" ? null : actualValue,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expectation-statement" required>
          Expectation
        </Label>
        <Textarea
          id="expectation-statement"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Chamber wall temperature stays below the material limit."
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectation-measure">Measure</Label>
          <Input
            id="expectation-measure"
            value={measure}
            onChange={(event) => setMeasure(event.target.value)}
            disabled={busy}
            placeholder="Peak wall temperature"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectation-expected">Expected value</Label>
          <Input
            id="expectation-expected"
            value={expectedValue}
            onChange={(event) => setExpectedValue(event.target.value)}
            disabled={busy}
            placeholder="800"
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectation-unit">Unit</Label>
          <Input
            id="expectation-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            disabled={busy}
            placeholder="K"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expectation-operator">Comparison operator</Label>
        <Select
          id="expectation-operator"
          value={comparisonOperator}
          onChange={(event) =>
            setComparisonOperator(event.target.value as ComparisonOperator | "")
          }
          disabled={busy}
        >
          <option value="">Not comparable (no explicit operator)</option>
          {COMPARISON_OPERATORS.map((operator) => (
            <option key={operator} value={operator}>
              {comparisonOperatorSymbol(operator)} — {operator.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Explicit and optional. With an operator and a numeric expected value, later observations
          can be compared against this expectation automatically; nothing infers an operator from
          the expected-value text above.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectation-actual">Observed value</Label>
          <Input
            id="expectation-actual"
            value={actualValue}
            onChange={(event) => setActualValue(event.target.value)}
            disabled={busy}
            placeholder="Leave blank until observed"
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectation-status">Observation status</Label>
          <Select
            id="expectation-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ExpectationStatus)}
            disabled={busy}
          >
            {EXPECTATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {expectationStatusLabel(value)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Set deliberately. Recording a value does not decide whether the expectation held.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          Save expectation
        </Button>
      </div>
    </form>
  );
}
