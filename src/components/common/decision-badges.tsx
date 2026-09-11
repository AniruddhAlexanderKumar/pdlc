import type { AssumptionStatus, DecisionStatus, ExpectationStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Decision memory status indicators.
 *
 * Meaning lives in the label, never in colour alone. The assumption and
 * expectation labels are worded to avoid implying the system checked
 * anything: "Not checked" and "Not observed" are states of *our knowledge*,
 * not of the world.
 */

const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  PROPOSED: "Proposed",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

const DECISION_STATUS_VARIANTS: Record<
  DecisionStatus,
  "secondary" | "info" | "success" | "destructive" | "outline"
> = {
  PROPOSED: "secondary",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  SUPERSEDED: "outline",
};

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  return <Badge variant={DECISION_STATUS_VARIANTS[status]}>{DECISION_STATUS_LABELS[status]}</Badge>;
}

export function decisionStatusLabel(status: DecisionStatus): string {
  return DECISION_STATUS_LABELS[status];
}

const ASSUMPTION_LABELS: Record<AssumptionStatus, string> = {
  UNKNOWN: "Not checked",
  ACTIVE: "Relied upon",
  VALIDATED: "Validated",
  INVALIDATED: "Invalidated",
};

const ASSUMPTION_VARIANTS: Record<
  AssumptionStatus,
  "outline" | "info" | "success" | "destructive"
> = {
  UNKNOWN: "outline",
  ACTIVE: "info",
  VALIDATED: "success",
  INVALIDATED: "destructive",
};

export function AssumptionStatusBadge({ status }: { status: AssumptionStatus }) {
  return <Badge variant={ASSUMPTION_VARIANTS[status]}>{ASSUMPTION_LABELS[status]}</Badge>;
}

export function assumptionStatusLabel(status: AssumptionStatus): string {
  return ASSUMPTION_LABELS[status];
}

const EXPECTATION_LABELS: Record<ExpectationStatus, string> = {
  NOT_OBSERVED: "Not observed",
  HELD: "Held",
  BREACHED: "Breached",
  UNKNOWN: "Inconclusive",
};

const EXPECTATION_VARIANTS: Record<
  ExpectationStatus,
  "outline" | "success" | "destructive" | "secondary"
> = {
  NOT_OBSERVED: "outline",
  HELD: "success",
  BREACHED: "destructive",
  UNKNOWN: "secondary",
};

export function ExpectationStatusBadge({ status }: { status: ExpectationStatus }) {
  return <Badge variant={EXPECTATION_VARIANTS[status]}>{EXPECTATION_LABELS[status]}</Badge>;
}

export function expectationStatusLabel(status: ExpectationStatus): string {
  return EXPECTATION_LABELS[status];
}
