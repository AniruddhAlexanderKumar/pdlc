import type { RequirementPriority, RequirementStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Status and priority indicators for requirements.
 *
 * Both carry their meaning in the label, not in colour alone, so they remain
 * readable to anyone who cannot distinguish the hues.
 */

const STATUS_LABELS: Record<RequirementStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  BASELINED: "Baselined",
  OBSOLETE: "Obsolete",
};

const STATUS_VARIANTS: Record<
  RequirementStatus,
  "secondary" | "info" | "success" | "default" | "outline"
> = {
  DRAFT: "secondary",
  IN_REVIEW: "info",
  APPROVED: "success",
  BASELINED: "default",
  OBSOLETE: "outline",
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function requirementStatusLabel(status: RequirementStatus): string {
  return STATUS_LABELS[status];
}

const PRIORITY_LABELS: Record<RequirementPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const PRIORITY_VARIANTS: Record<RequirementPriority, "outline" | "secondary" | "warning" | "destructive"> =
  {
    LOW: "outline",
    MEDIUM: "secondary",
    HIGH: "warning",
    CRITICAL: "destructive",
  };

export function RequirementPriorityBadge({ priority }: { priority: RequirementPriority }) {
  return <Badge variant={PRIORITY_VARIANTS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}
