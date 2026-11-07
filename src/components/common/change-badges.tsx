import type { ChangeImpactTargetType, ChangeRequestStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Change request indicators.
 *
 * Meaning lives in the label, never in colour alone. The target-type labels
 * name the artifact kind plainly, because a reader scanning declared impacts
 * needs to know what sort of thing is claimed to be affected before anything
 * else.
 */

const CHANGE_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IMPLEMENTED: "Implemented",
  CANCELLED: "Cancelled",
};

const CHANGE_STATUS_VARIANTS: Record<
  ChangeRequestStatus,
  "secondary" | "info" | "success" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  IMPLEMENTED: "success",
  CANCELLED: "outline",
};

export function ChangeStatusBadge({ status }: { status: ChangeRequestStatus }) {
  return <Badge variant={CHANGE_STATUS_VARIANTS[status]}>{CHANGE_STATUS_LABELS[status]}</Badge>;
}

export function changeStatusLabel(status: ChangeRequestStatus): string {
  return CHANGE_STATUS_LABELS[status];
}

const IMPACT_TARGET_LABELS: Record<ChangeImpactTargetType, string> = {
  REQUIREMENT: "Requirement",
  DESIGN_ITEM: "Design item",
  ENGINEERING_DECISION: "Decision",
  VERIFICATION_ACTIVITY: "Verification",
  RISK: "Risk",
  ISSUE: "Issue",
  SUPPLIER: "Supplier",
  SUPPLIED_ITEM: "Supplied item",
};

export function ImpactTargetBadge({ type }: { type: ChangeImpactTargetType }) {
  return <Badge variant="outline">{IMPACT_TARGET_LABELS[type]}</Badge>;
}

export function impactTargetLabel(type: ChangeImpactTargetType): string {
  return IMPACT_TARGET_LABELS[type];
}
