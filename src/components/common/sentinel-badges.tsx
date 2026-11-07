import type { SurveillanceTargetStatus, SurveillanceTargetType } from "@/domain";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

/**
 * Status indicators for the Decision Sentinel.
 *
 * As elsewhere, meaning lives in the label, never the colour, and there is no
 * numeric score anywhere — a surveillance signal is a fact about provenance
 * ("this changed, and this analysis may depend on it"), not a risk rating.
 */

const STATUS_VARIANTS: Record<
  SurveillanceTargetStatus,
  "warning" | "default" | "success" | "outline"
> = {
  OPEN: "warning",
  ACKNOWLEDGED: "default",
  RESOLVED: "success",
  SUPERSEDED: "outline",
};

export function SurveillanceStatusBadge({ status }: { status: SurveillanceTargetStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function SurveillanceTargetTypeBadge({
  targetType,
}: {
  targetType: SurveillanceTargetType;
}) {
  return <Badge variant="outline">{titleCase(targetType)}</Badge>;
}

export function sentinelLabel(value: string): string {
  return titleCase(value);
}
