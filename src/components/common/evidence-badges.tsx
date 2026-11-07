import type { EvidenceStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Status indicator for evidence records.
 *
 * Carries its meaning in the label, not in colour alone. There is no
 * integrity/hash badge here — this system stores no file content to hash,
 * and nothing here should ever be read as claiming otherwise.
 */

const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  DRAFT: "Draft",
  VALIDATED: "Validated",
  SUPERSEDED: "Superseded",
};

const EVIDENCE_STATUS_VARIANTS: Record<EvidenceStatus, "secondary" | "success" | "outline"> = {
  DRAFT: "secondary",
  VALIDATED: "success",
  SUPERSEDED: "outline",
};

export function EvidenceStatusBadge({ status }: { status: EvidenceStatus }) {
  return <Badge variant={EVIDENCE_STATUS_VARIANTS[status]}>{EVIDENCE_STATUS_LABELS[status]}</Badge>;
}
