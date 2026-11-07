import type {
  SuppliedItemStatus,
  SuppliedItemType,
  SupplierQualificationStatus,
  SupplierQualificationType,
  SupplierStatus,
} from "@/domain";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

/**
 * Status and type indicators for supplier engineering.
 *
 * As elsewhere, meaning lives in the label rather than the colour, so these stay
 * readable without relying on hue.
 *
 * Note the deliberate absence: there is no supplier rating, tier or health
 * indicator here, and no badge that combines a supplier's status with its
 * qualifications'. Those are independent facts, and a single blended indicator
 * would be a judgement the system has no basis to make.
 */

const SUPPLIER_STATUS_VARIANTS: Record<SupplierStatus, "success" | "outline" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "outline",
  UNDER_REVIEW: "info",
};

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  return <Badge variant={SUPPLIER_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const SUPPLIED_ITEM_STATUS_VARIANTS: Record<SuppliedItemStatus, "success" | "outline" | "info"> = {
  ACTIVE: "success",
  OBSOLETE: "outline",
  UNDER_REVIEW: "info",
};

export function SuppliedItemStatusBadge({ status }: { status: SuppliedItemStatus }) {
  return <Badge variant={SUPPLIED_ITEM_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function SuppliedItemTypeBadge({ itemType }: { itemType: SuppliedItemType }) {
  return <Badge variant="secondary">{titleCase(itemType)}</Badge>;
}

/**
 * Qualification status, shown exactly as recorded.
 *
 * `EXPIRED` appears here only because a person set it. Nothing derives it from
 * an expiry date having passed — see the domain enum. A date in the past is
 * shown as a date in the past, which is a fact; calling it expired would be a
 * conclusion.
 */
const QUALIFICATION_STATUS_VARIANTS: Record<
  SupplierQualificationStatus,
  "secondary" | "success" | "destructive" | "outline"
> = {
  PLANNED: "secondary",
  ACTIVE: "success",
  EXPIRED: "destructive",
  WITHDRAWN: "outline",
};

export function QualificationStatusBadge({ status }: { status: SupplierQualificationStatus }) {
  return <Badge variant={QUALIFICATION_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function QualificationTypeBadge({
  qualificationType,
}: {
  qualificationType: SupplierQualificationType;
}) {
  return <Badge variant="outline">{titleCase(qualificationType)}</Badge>;
}

export function supplierLabel(value: string): string {
  return titleCase(value);
}
