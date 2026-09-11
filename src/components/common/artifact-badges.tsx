import type {
  DesignItemStatus,
  DesignItemType,
  StakeholderNeedStatus,
  VerificationMethod,
  VerificationStatus,
} from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Status and type indicators for the foundational artifacts.
 *
 * As elsewhere, meaning lives in the label rather than the colour, so these
 * remain readable without relying on hue.
 */

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

const NEED_STATUS_VARIANTS: Record<
  StakeholderNeedStatus,
  "secondary" | "success" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  ACCEPTED: "success",
  REJECTED: "destructive",
  OBSOLETE: "outline",
};

export function StakeholderNeedStatusBadge({ status }: { status: StakeholderNeedStatus }) {
  return <Badge variant={NEED_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const DESIGN_STATUS_VARIANTS: Record<
  DesignItemStatus,
  "secondary" | "info" | "success" | "default" | "outline"
> = {
  DRAFT: "secondary",
  IN_REVIEW: "info",
  APPROVED: "success",
  BASELINED: "default",
  OBSOLETE: "outline",
};

export function DesignItemStatusBadge({ status }: { status: DesignItemStatus }) {
  return <Badge variant={DESIGN_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function DesignItemTypeBadge({ itemType }: { itemType: DesignItemType }) {
  return <Badge variant="outline">{titleCase(itemType)}</Badge>;
}

const VERIFICATION_STATUS_VARIANTS: Record<
  VerificationStatus,
  "secondary" | "info" | "success" | "destructive" | "warning"
> = {
  PLANNED: "secondary",
  IN_PROGRESS: "info",
  PASSED: "success",
  FAILED: "destructive",
  WAIVED: "warning",
};

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={VERIFICATION_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function VerificationMethodBadge({ method }: { method: VerificationMethod }) {
  return <Badge variant="outline">{titleCase(method)}</Badge>;
}

export { titleCase as artifactLabel };
