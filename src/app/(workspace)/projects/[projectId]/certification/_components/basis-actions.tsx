"use client";

import * as React from "react";
import { describeApiError } from "@/lib/api/client";
import { type CertificationBasisDto, activateBasis } from "@/lib/api/certification";
import { Button } from "@/components/ui/button";

export interface BasisActionsMenuProps {
  projectId: string;
  basis: CertificationBasisDto;
  allBases: CertificationBasisDto[];
  onChanged: () => void;
}

/**
 * The one action a basis row needs: activating a DRAFT basis.
 *
 * `supersedeActive` is always sent as `true` here — the explicit flag the API
 * requires is satisfied by the button itself being an explicit user action;
 * nothing about the *previous* active basis is hidden, and the row for it
 * still shows SUPERSEDED once this succeeds. ACTIVE and SUPERSEDED bases are
 * otherwise immutable and show no actions.
 */
export function BasisActionsMenu({ projectId, basis, onChanged }: BasisActionsMenuProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (basis.status !== "DRAFT") {
    return null;
  }

  async function handleActivate() {
    setIsSubmitting(true);
    setError(null);
    try {
      await activateBasis(projectId, basis.id, true);
      onChanged();
    } catch (activationError) {
      setError(describeApiError(activationError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleActivate} disabled={isSubmitting}>
        {isSubmitting ? "Activating…" : "Activate"}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </div>
  );
}
