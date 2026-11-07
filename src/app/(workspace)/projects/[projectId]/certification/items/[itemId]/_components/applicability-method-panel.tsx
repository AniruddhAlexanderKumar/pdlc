"use client";

import * as React from "react";
import { complianceApplicabilitySchema, complianceMethodSchema, updateComplianceItemRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type ComplianceItemDto, updateItem } from "@/lib/api/certification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Applicability and compliance method.
 *
 * Both are explicit human judgements: nothing here infers applicability from
 * keywords, and nothing derives a method from a linked artifact. Saving
 * applicability always records who reviewed it and when — the server stamps
 * `applicabilityReviewerId`/`applicabilityReviewedAt` from the authenticated
 * caller, never from this form.
 */
export function ApplicabilityMethodPanel({
  projectId,
  item,
  onSaved,
}: {
  projectId: string;
  item: ComplianceItemDto;
  onSaved: (item: ComplianceItemDto) => void;
}) {
  const [applicability, setApplicability] = React.useState(item.applicability);
  const [rationale, setRationale] = React.useState(item.applicabilityRationale ?? "");
  const [method, setMethod] = React.useState(item.method ?? "");
  const [isSubmittingApplicability, setIsSubmittingApplicability] = React.useState(false);
  const [isSubmittingMethod, setIsSubmittingMethod] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function saveApplicability() {
    setIsSubmittingApplicability(true);
    setError(null);
    try {
      const parsed = updateComplianceItemRequestSchema.parse({
        applicability,
        applicabilityRationale: rationale.trim() === "" ? null : rationale,
      });
      const saved = await updateItem(projectId, item.id, parsed);
      onSaved(saved);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmittingApplicability(false);
    }
  }

  async function saveMethod(nextMethod: string) {
    setMethod(nextMethod);
    setIsSubmittingMethod(true);
    setError(null);
    try {
      const parsed = updateComplianceItemRequestSchema.parse({
        method: nextMethod === "" ? null : nextMethod,
      });
      const saved = await updateItem(projectId, item.id, parsed);
      onSaved(saved);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmittingMethod(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Applicability &amp; method</CardTitle>
        <CardDescription>
          Whether this obligation applies, and how compliance is established — both explicit
          judgements, never inferred.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Applicability</span>
          <Select
            value={applicability}
            onChange={(event) => setApplicability(event.target.value as typeof applicability)}
            disabled={isSubmittingApplicability}
          >
            {complianceApplicabilitySchema.options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Applicability rationale</span>
          <Textarea
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            disabled={isSubmittingApplicability}
            rows={2}
            placeholder="Why this determination was made."
          />
        </label>

        {item.applicabilityReviewedAt && (
          <p className="text-muted-foreground text-xs">
            Last reviewed {new Date(item.applicabilityReviewedAt).toLocaleString()}.
          </p>
        )}

        <Button size="sm" onClick={saveApplicability} disabled={isSubmittingApplicability} className="self-start">
          {isSubmittingApplicability ? "Saving…" : "Save applicability"}
        </Button>

        <hr className="border-border" />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Compliance method</span>
          <Select value={method} onChange={(event) => saveMethod(event.target.value)} disabled={isSubmittingMethod}>
            <option value="">Not chosen</option>
            {complianceMethodSchema.options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
      </CardContent>
    </Card>
  );
}
