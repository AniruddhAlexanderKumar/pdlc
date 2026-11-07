import type {
  CertificationBasisStatus,
  CertificationFindingSeverity,
  CertificationFindingStatus,
  CertificationProgramStatus,
  CertificationReviewFindingStatus,
  CertificationReviewFreshness,
  CertificationReviewStatus,
  ComplianceApplicability,
  ComplianceDisposition,
  ComplianceItemStatus,
} from "@/domain";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

/**
 * Status indicators for the certification workspace.
 *
 * Meaning lives in the label, never the colour. There is no percentage
 * anywhere in this file, and `CertificationReviewStatusBadge` never renders
 * anything that could be read as a regulatory claim — `READY` shows as
 * "Ready for internal review", not "Certified" or "Approved".
 */

const PROGRAM_STATUS_VARIANTS: Record<
  CertificationProgramStatus,
  "secondary" | "success" | "warning" | "outline"
> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  ON_HOLD: "warning",
  CLOSED: "outline",
};

export function CertificationProgramStatusBadge({
  status,
}: {
  status: CertificationProgramStatus;
}) {
  return <Badge variant={PROGRAM_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const BASIS_STATUS_VARIANTS: Record<CertificationBasisStatus, "secondary" | "success" | "outline"> =
  {
    DRAFT: "secondary",
    ACTIVE: "success",
    SUPERSEDED: "outline",
  };

export function CertificationBasisStatusBadge({ status }: { status: CertificationBasisStatus }) {
  return <Badge variant={BASIS_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const APPLICABILITY_VARIANTS: Record<ComplianceApplicability, "success" | "outline" | "secondary"> =
  {
    APPLICABLE: "success",
    NOT_APPLICABLE: "outline",
    UNDETERMINED: "secondary",
  };

const APPLICABILITY_LABELS: Record<ComplianceApplicability, string> = {
  APPLICABLE: "Applicable",
  NOT_APPLICABLE: "Not applicable",
  UNDETERMINED: "Undetermined",
};

export function ApplicabilityBadge({ applicability }: { applicability: ComplianceApplicability }) {
  return (
    <Badge variant={APPLICABILITY_VARIANTS[applicability]}>
      {APPLICABILITY_LABELS[applicability]}
    </Badge>
  );
}

const ITEM_STATUS_VARIANTS: Record<
  ComplianceItemStatus,
  "secondary" | "success" | "warning" | "outline" | "default"
> = {
  OPEN: "secondary",
  IN_PROGRESS: "default",
  SATISFIED: "success",
  BLOCKED: "warning",
  WAIVED: "outline",
  CLOSED: "outline",
};

export function ComplianceItemStatusBadge({ status }: { status: ComplianceItemStatus }) {
  return <Badge variant={ITEM_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const DISPOSITION_VARIANTS: Record<
  ComplianceDisposition,
  "secondary" | "success" | "destructive" | "outline" | "warning"
> = {
  UNASSESSED: "secondary",
  COMPLIANT: "success",
  NON_COMPLIANT: "destructive",
  NOT_APPLICABLE: "outline",
  OPEN_FINDING: "warning",
};

export function DispositionBadge({ disposition }: { disposition: ComplianceDisposition }) {
  return <Badge variant={DISPOSITION_VARIANTS[disposition]}>{titleCase(disposition)}</Badge>;
}

const FINDING_SEVERITY_VARIANTS: Record<
  CertificationFindingSeverity,
  "outline" | "secondary" | "warning" | "destructive"
> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "warning",
  CRITICAL: "destructive",
};

export function CertificationFindingSeverityBadge({
  severity,
}: {
  severity: CertificationFindingSeverity;
}) {
  return <Badge variant={FINDING_SEVERITY_VARIANTS[severity]}>{titleCase(severity)}</Badge>;
}

const FINDING_STATUS_VARIANTS: Record<
  CertificationFindingStatus,
  "warning" | "default" | "success" | "outline"
> = {
  OPEN: "warning",
  IN_PROGRESS: "default",
  RESOLVED: "success",
  ACCEPTED: "outline",
};

export function CertificationFindingStatusBadge({
  status,
}: {
  status: CertificationFindingStatus;
}) {
  return <Badge variant={FINDING_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

/**
 * The review verdict. Never `destructive` for NOT_READY — this is an internal
 * workspace state, not a failure or a regulatory rejection.
 */
const REVIEW_STATUS_VARIANTS: Record<
  CertificationReviewStatus,
  "success" | "warning" | "secondary"
> = {
  READY: "success",
  NOT_READY: "warning",
  UNKNOWN: "secondary",
};

const REVIEW_STATUS_LABELS: Record<CertificationReviewStatus, string> = {
  READY: "Ready for internal review",
  NOT_READY: "Not ready",
  UNKNOWN: "Unknown",
};

export function CertificationReviewStatusBadge({ status }: { status: CertificationReviewStatus }) {
  return <Badge variant={REVIEW_STATUS_VARIANTS[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>;
}

const REVIEW_FINDING_STATUS_VARIANTS: Record<
  CertificationReviewFindingStatus,
  "warning" | "secondary" | "outline"
> = {
  BLOCKING: "warning",
  WARNING: "secondary",
  INFORMATIONAL: "outline",
  UNKNOWN: "secondary",
};

export function CertificationReviewFindingStatusBadge({
  status,
}: {
  status: CertificationReviewFindingStatus;
}) {
  return <Badge variant={REVIEW_FINDING_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const FRESHNESS_VARIANTS: Record<
  CertificationReviewFreshness,
  "success" | "destructive" | "secondary"
> = {
  CURRENT: "success",
  STALE: "destructive",
  UNKNOWN: "secondary",
};

export function CertificationReviewFreshnessBadge({
  freshness,
}: {
  freshness: CertificationReviewFreshness;
}) {
  return <Badge variant={FRESHNESS_VARIANTS[freshness]}>{titleCase(freshness)}</Badge>;
}

export function certificationLabel(value: string): string {
  return titleCase(value);
}
