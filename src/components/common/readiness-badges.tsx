import { CircleHelp, CircleSlash, Info, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import type {
  ReadinessBasisRole,
  ReadinessFreshness,
  TechnicalReadinessCategory,
  TechnicalReadinessFindingStatus,
  TechnicalReadinessFreshness,
  TechnicalReadinessStatus,
  TechnicalScopeRole,
  VerificationReadinessCategory,
  VerificationReadinessFindingStatus,
  VerificationReadinessScope,
  VerificationReadinessStatus,
} from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Readiness indicators.
 *
 * Every state carries a word and an icon, never a colour alone — a readiness
 * verdict that is only legible to someone who can distinguish red from green is
 * not legible. The icons repeat what the label already says, so nothing is lost
 * to a screen reader either.
 *
 * There is no numeric indicator anywhere in this file, and there is nothing to
 * add one to: readiness has three states and a list of reasons.
 */

const STATUS_LABELS: Record<VerificationReadinessStatus, string> = {
  READY: "Ready",
  NOT_READY: "Not ready",
  UNKNOWN: "Unknown",
};

const STATUS_VARIANTS: Record<
  VerificationReadinessStatus,
  "success" | "destructive" | "warning"
> = {
  READY: "success",
  NOT_READY: "destructive",
  UNKNOWN: "warning",
};

export function readinessStatusLabel(status: VerificationReadinessStatus): string {
  return STATUS_LABELS[status];
}

export function ReadinessStatusBadge({ status }: { status: VerificationReadinessStatus }) {
  const Icon =
    status === "READY" ? ShieldCheck : status === "NOT_READY" ? ShieldX : CircleHelp;

  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const FINDING_LABELS: Record<VerificationReadinessFindingStatus, string> = {
  BLOCKING: "Blocking",
  WARNING: "Warning",
  INFORMATIONAL: "Information",
  UNKNOWN: "Unknown",
};

const FINDING_VARIANTS: Record<
  VerificationReadinessFindingStatus,
  "destructive" | "warning" | "secondary" | "outline"
> = {
  BLOCKING: "destructive",
  WARNING: "warning",
  INFORMATIONAL: "secondary",
  UNKNOWN: "outline",
};

export function readinessFindingLabel(status: VerificationReadinessFindingStatus): string {
  return FINDING_LABELS[status];
}

export function ReadinessFindingBadge({
  status,
}: {
  status: VerificationReadinessFindingStatus;
}) {
  const Icon =
    status === "BLOCKING"
      ? ShieldX
      : status === "WARNING"
        ? TriangleAlert
        : status === "UNKNOWN"
          ? CircleHelp
          : Info;

  return (
    <Badge variant={FINDING_VARIANTS[status]}>
      <Icon className="size-3.5" aria-hidden="true" />
      {FINDING_LABELS[status]}
    </Badge>
  );
}

const FRESHNESS_LABELS: Record<ReadinessFreshness, string> = {
  CURRENT: "Current",
  STALE: "Stale",
  UNKNOWN: "Unknown",
};

export function ReadinessFreshnessBadge({ freshness }: { freshness: ReadinessFreshness }) {
  const Icon =
    freshness === "CURRENT" ? ShieldCheck : freshness === "STALE" ? CircleSlash : CircleHelp;

  return (
    <Badge
      variant={
        freshness === "CURRENT" ? "success" : freshness === "STALE" ? "destructive" : "warning"
      }
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {FRESHNESS_LABELS[freshness]}
    </Badge>
  );
}

const CATEGORY_LABELS: Record<VerificationReadinessCategory, string> = {
  REQUIREMENT_STATE: "Requirement state",
  VERIFICATION_DEFINITION: "Verification definition",
  OWNER: "Owner",
  DESIGN_STATE: "Design state",
  DECISION_STATE: "Decision state",
  ASSUMPTION_STATE: "Assumption state",
  EVIDENCE: "Evidence",
  CHANGE_IMPACT: "Change impact",
  TRACEABILITY: "Traceability",
  UNKNOWN: "Unknown",
};

export function readinessCategoryLabel(category: VerificationReadinessCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * What question the assessment answered.
 *
 * Shown wherever a verdict is, because READY means different things before and
 * after execution has begun, and leaving that implicit is how a reader
 * mistakes "safe to conclude" for "safe to start".
 */
const SCOPE_LABELS: Record<VerificationReadinessScope, string> = {
  EXECUTION: "Ready to execute?",
  CLOSURE: "Ready to conclude?",
  NOT_APPLICABLE: "Concluded — readiness no longer applies",
};

export function readinessScopeLabel(scope: VerificationReadinessScope): string {
  return SCOPE_LABELS[scope];
}

const ROLE_LABELS: Record<ReadinessBasisRole, string> = {
  VERIFICATION_ACTIVITY: "Verification activity",
  VERIFIED_REQUIREMENT: "Requirement verified",
  PREREQUISITE_DESIGN_ITEM: "Prerequisite design item",
  RELEVANT_DECISION: "Engineering decision depended on",
  DECISION_ASSUMPTION: "Assumption behind a decision",
  ATTACHED_EVIDENCE: "Evidence attached",
};

export function readinessBasisRoleLabel(role: ReadinessBasisRole): string {
  return ROLE_LABELS[role] ?? role;
}

/** Human wording for a basis marker, without softening what it does not claim. */
export function readinessBasisMarkerLabel(marker: string): string {
  return marker.toLowerCase().replaceAll("_", " ");
}

/**
 * Technical readiness reuses the same three-state vocabulary and the same
 * word-plus-icon treatment, because a reader who has learned what READY means
 * on a verification activity should not have to learn it again at a gate.
 *
 * The types are separate on purpose — the two engines have independent rule
 * sets and must be able to diverge — so these thin wrappers keep the shared
 * presentation without coupling the domains.
 */
export function TechnicalReadinessStatusBadge({
  status,
}: {
  status: TechnicalReadinessStatus;
}) {
  return <ReadinessStatusBadge status={status} />;
}

export function technicalReadinessStatusLabel(status: TechnicalReadinessStatus): string {
  return STATUS_LABELS[status];
}

export function TechnicalFindingBadge({
  status,
}: {
  status: TechnicalReadinessFindingStatus;
}) {
  return <ReadinessFindingBadge status={status} />;
}

export function TechnicalFreshnessBadge({
  freshness,
}: {
  freshness: TechnicalReadinessFreshness;
}) {
  return <ReadinessFreshnessBadge freshness={freshness} />;
}

const TECHNICAL_CATEGORY_LABELS: Record<TechnicalReadinessCategory, string> = {
  REQUIREMENT: "Requirement",
  DESIGN: "Design",
  DECISION: "Decision",
  ASSUMPTION: "Assumption",
  VERIFICATION: "Verification",
  CHANGE: "Change",
  RISK: "Risk",
  ISSUE: "Issue",
  EVIDENCE: "Evidence",
  TRACEABILITY: "Traceability",
  UNKNOWN: "Scope",
};

export function technicalCategoryLabel(category: TechnicalReadinessCategory): string {
  return TECHNICAL_CATEGORY_LABELS[category] ?? category;
}

const SCOPE_ROLE_LABELS: Record<TechnicalScopeRole, string> = {
  REQUIREMENT: "Requirements",
  DESIGN_ITEM: "Design items",
  ENGINEERING_DECISION: "Engineering decisions",
  DECISION_ASSUMPTION: "Decision assumptions",
  VERIFICATION_ACTIVITY: "Verification activities",
  STAKEHOLDER_NEED: "Stakeholder needs",
  EVIDENCE: "Evidence",
  CHANGE_REQUEST: "Change requests in flight",
  RISK: "Open risks",
  ISSUE: "Unresolved issues",
};

export function scopeRoleLabel(role: TechnicalScopeRole): string {
  return SCOPE_ROLE_LABELS[role] ?? role;
}
