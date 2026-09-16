"use client";

import * as React from "react";
import type { ProjectStatus } from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

export interface PortfolioProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  updatedAt: string;
  openRisks: number;
  openIssues: number;
  attentionIssues: number;
  openSentinel: number;
}

export interface PortfolioDto {
  projects: PortfolioProjectDto[];
  totals: {
    projects: number;
    openRisks: number;
    openIssues: number;
    attentionIssues: number;
    openSentinel: number;
  };
}

export async function fetchPortfolio(signal?: AbortSignal): Promise<PortfolioDto> {
  return requestJson<PortfolioDto>("/api/portfolio", "portfolio", { signal });
}

/** Owner or executive only; a member calling this gets a 403 from the server regardless of what the UI shows. */
export function usePortfolio() {
  return useResource<PortfolioDto>(
    React.useCallback((signal) => fetchPortfolio(signal), []),
    "portfolio",
  );
}
