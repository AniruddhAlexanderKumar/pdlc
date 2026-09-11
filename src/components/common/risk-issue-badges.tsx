import type { IssueSeverity, IssueStatus, RiskStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Status and severity indicators for risks and issues.
 *
 * Both carry their meaning in the label, not in colour alone. There is no
 * numeric score badge anywhere here — the domain records none, so nothing is
 * rendered as if it did.
 */

const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: "Open",
  MITIGATED: "Mitigated",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};

const RISK_STATUS_VARIANTS: Record<RiskStatus, "warning" | "info" | "secondary" | "outline"> = {
  OPEN: "warning",
  MITIGATED: "info",
  ACCEPTED: "secondary",
  CLOSED: "outline",
};

export function RiskStatusBadge({ status }: { status: RiskStatus }) {
  return <Badge variant={RISK_STATUS_VARIANTS[status]}>{RISK_STATUS_LABELS[status]}</Badge>;
}

export function riskStatusLabel(status: RiskStatus): string {
  return RISK_STATUS_LABELS[status];
}

const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const ISSUE_STATUS_VARIANTS: Record<IssueStatus, "warning" | "info" | "success" | "outline"> = {
  OPEN: "warning",
  IN_PROGRESS: "info",
  RESOLVED: "success",
  CLOSED: "outline",
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <Badge variant={ISSUE_STATUS_VARIANTS[status]}>{ISSUE_STATUS_LABELS[status]}</Badge>;
}

export function issueStatusLabel(status: IssueStatus): string {
  return ISSUE_STATUS_LABELS[status];
}

const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const ISSUE_SEVERITY_VARIANTS: Record<IssueSeverity, "outline" | "secondary" | "warning" | "destructive"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "warning",
  CRITICAL: "destructive",
};

export function IssueSeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <Badge variant={ISSUE_SEVERITY_VARIANTS[severity]}>{ISSUE_SEVERITY_LABELS[severity]}</Badge>;
}

export function issueSeverityLabel(severity: IssueSeverity): string {
  return ISSUE_SEVERITY_LABELS[severity];
}
