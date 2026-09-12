"use client";

import * as React from "react";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Engineering Command Center API access.
 *
 * A single GET, because the command center is a read model: there is
 * nothing here to create, update, or transition. Every field mirrors
 * `CommandCenterView` in `@/domain` — dates arrive as ISO strings, and
 * nothing here is a score, a percentage, or a composite verdict, because
 * the server never computed one.
 */

export interface AttentionItemDto {
  key: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  identifier: string | null;
  title: string;
  state: string;
  reason: string;
  href: string;
}

export interface CommandCenterProjectDto {
  id: string;
  identifier: string | null;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GateSummaryDto {
  gate: string;
  status: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
  freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
  evaluatedAt: string | null;
  blocking: number;
  unknown: number;
  href: string;
}

export interface VerificationOverviewDto {
  activitiesTotal: number;
  activitiesFailed: number;
  activitiesNeverEvaluated: number;
  attentionActivities: Array<{
    id: string;
    identifier: string | null;
    title: string;
    activityStatus: string;
    readinessStatus: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
    evaluatedAt: string | null;
    href: string;
  }>;
}

export interface CertificationOverviewDto {
  hasProgram: boolean;
  programIdentifier: string | null;
  activeBasisIdentifier: string | null;
  review: {
    status: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
    evaluatedAt: string | null;
    blockingCount: number;
    unknownCount: number;
    href: string;
  } | null;
  openFindings: Array<{ id: string; identifier: string; title: string; status: string; href: string }>;
}

export interface ChangeImpactOverviewDto {
  activeChanges: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    latestAnalysis: {
      status: "RUNNING" | "COMPLETED" | "FAILED" | "NOT_RUN";
      freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
      startedAt: string | null;
      direct: number;
      downstream: number;
      crossDomain: number;
      unknown: number;
    };
    href: string;
  }>;
}

export interface AssumptionOverviewDto {
  total: number;
  reviewRequired: number;
  basisChanged: number;
  neverEvaluated: number;
  attentionAssumptions: Array<{
    id: string;
    decisionId: string;
    decisionIdentifier: string;
    statement: string;
    monitoringStatus: string;
    href: string;
  }>;
}

export interface DriftOverviewDto {
  status: "NO_DRIFT" | "DRIFT_DETECTED" | "UNKNOWN" | "NOT_EVALUATED";
  evaluatedAt: string | null;
  findings: number;
  reviewRequired: number;
  unknown: number;
  href: string;
}

export interface RiskOverviewDto {
  open: number;
  items: Array<{ id: string; identifier: string; title: string; status: string; href: string }>;
}

export interface IssueOverviewDto {
  open: number;
  attentionCount: number;
  items: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    severity: string;
    href: string;
  }>;
}

export interface SupplierOverviewDto {
  suppliersUnderReview: Array<{ id: string; identifier: string; title: string; href: string }>;
  suppliedItemsUnderReview: Array<{ id: string; identifier: string; title: string; href: string }>;
  qualificationsAttention: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    href: string;
  }>;
}

export interface EvidenceOverviewDto {
  draftCount: number;
  validatedCount: number;
  supersededCount: number;
  draftItems: Array<{ id: string; identifier: string; title: string; href: string }>;
}

export interface SentinelOverviewDto {
  openCount: number;
  acknowledgedCount: number;
  targets: Array<{
    id: string;
    targetType: string;
    targetIdentifier: string | null;
    targetLabel: string;
    status: string;
    reason: string;
    href: string;
  }>;
}

export interface CommandCenterDto {
  project: CommandCenterProjectDto;
  attentionItems: AttentionItemDto[];
  readiness: {
    technical: GateSummaryDto[];
    verification: VerificationOverviewDto;
    certification: CertificationOverviewDto;
    changeImpact: ChangeImpactOverviewDto;
    assumptions: AssumptionOverviewDto;
    drift: DriftOverviewDto;
  };
  risks: RiskOverviewDto;
  issues: IssueOverviewDto;
  suppliers: SupplierOverviewDto;
  evidence: EvidenceOverviewDto;
  sentinel: SentinelOverviewDto;
  traceabilityHref: string;
}

export async function fetchCommandCenter(
  projectId: string,
  signal?: AbortSignal,
): Promise<CommandCenterDto> {
  return requestJson<CommandCenterDto>(
    `/api/projects/${projectId}/command-center`,
    "commandCenter",
    { signal },
  );
}

export function useCommandCenter(projectId: string) {
  return useResource<CommandCenterDto>(
    React.useCallback((signal) => fetchCommandCenter(projectId, signal), [projectId]),
    `command-center:${projectId}`,
  );
}
