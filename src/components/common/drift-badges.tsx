import type {
  BaselineStatus,
  DriftCategory,
  DriftFindingStatus,
  DriftFreshness,
  DriftStatus,
  ObservationStatus,
  ObservationType,
} from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Status indicators for baselines, observations and drift.
 *
 * As elsewhere, meaning lives in the label rather than the colour.
 *
 * Note what is absent and will stay absent: there is no percentage, no
 * "97% aligned", no drift score, no confidence and no severity ranking. A drift
 * verdict is one of three words, and a finding either asks for review or does
 * not. A number here would suggest a measurement nobody made.
 */

function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * `BASELINE_CHANGED` → `Baseline changed`.
 *
 * Sentence case, matching the drift verdict and finding-status labels. A drift
 * category is a phrase, not a proper noun, and Title Casing it would make it
 * read like a defined severity class.
 */
function sentenceCase(value: string): string {
  const words = value.split("_").map((word) => word.toLowerCase());
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

const BASELINE_STATUS_VARIANTS: Record<BaselineStatus, "secondary" | "success" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  SUPERSEDED: "outline",
};

export function BaselineStatusBadge({ status }: { status: BaselineStatus }) {
  return <Badge variant={BASELINE_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

const OBSERVATION_STATUS_VARIANTS: Record<
  ObservationStatus,
  "secondary" | "success" | "outline"
> = {
  RECORDED: "secondary",
  REVIEWED: "success",
  REJECTED: "outline",
};

export function ObservationStatusBadge({ status }: { status: ObservationStatus }) {
  return <Badge variant={OBSERVATION_STATUS_VARIANTS[status]}>{titleCase(status)}</Badge>;
}

export function ObservationTypeBadge({ observationType }: { observationType: ObservationType }) {
  return <Badge variant="outline">{titleCase(observationType)}</Badge>;
}

/**
 * The drift verdict.
 *
 * `DRIFT_DETECTED` renders as an attention colour, not a destructive one. Drift
 * is a divergence requiring engineering judgement — it is not a failure, and a
 * red badge would say otherwise before anyone had read the findings.
 */
const DRIFT_STATUS_VARIANTS: Record<DriftStatus, "success" | "warning" | "secondary"> = {
  NO_DRIFT: "success",
  DRIFT_DETECTED: "warning",
  UNKNOWN: "secondary",
};

const DRIFT_STATUS_LABELS: Record<DriftStatus, string> = {
  NO_DRIFT: "No drift",
  DRIFT_DETECTED: "Drift detected",
  UNKNOWN: "Unknown",
};

export function DriftStatusBadge({ status }: { status: DriftStatus }) {
  return <Badge variant={DRIFT_STATUS_VARIANTS[status]}>{DRIFT_STATUS_LABELS[status]}</Badge>;
}

const FINDING_STATUS_VARIANTS: Record<DriftFindingStatus, "warning" | "secondary" | "outline"> = {
  REVIEW_REQUIRED: "warning",
  UNKNOWN: "secondary",
  INFORMATIONAL: "outline",
};

const FINDING_STATUS_LABELS: Record<DriftFindingStatus, string> = {
  REVIEW_REQUIRED: "Review required",
  UNKNOWN: "Unknown",
  INFORMATIONAL: "Informational",
};

export function DriftFindingStatusBadge({ status }: { status: DriftFindingStatus }) {
  return <Badge variant={FINDING_STATUS_VARIANTS[status]}>{FINDING_STATUS_LABELS[status]}</Badge>;
}

export function DriftCategoryBadge({ category }: { category: DriftCategory }) {
  return <Badge variant="outline">{sentenceCase(category)}</Badge>;
}

const FRESHNESS_VARIANTS: Record<DriftFreshness, "success" | "destructive" | "secondary"> = {
  CURRENT: "success",
  STALE: "destructive",
  UNKNOWN: "secondary",
};

export function DriftFreshnessBadge({ freshness }: { freshness: DriftFreshness }) {
  return <Badge variant={FRESHNESS_VARIANTS[freshness]}>{titleCase(freshness)}</Badge>;
}

export function driftLabel(value: string): string {
  return titleCase(value);
}
