import type { ProjectStatus } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as portfolioRepository from "@/server/repositories/portfolio.repository";
import * as projectRepository from "@/server/repositories/project.repository";
import { requirePortfolioAccess } from "./authorization.service";

/**
 * The executive portfolio: every project in the organization, with the
 * counts an executive can act on by asking someone about, and nothing else.
 *
 * **There is no portfolio score, no rollup health, and no ranking.** That
 * is the same restraint every other surface in this product observes, and
 * it matters most here: a single number summarising a whole programme is
 * exactly the kind of figure an executive would reasonably act on, and
 * exactly the kind this system cannot honestly produce. Each row carries
 * real counts, each of which is already visible — and identically defined
 * — on that project's own Command Center.
 *
 * This is a *read model*. It computes no verdict and stores nothing.
 */

export interface PortfolioProject {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  updatedAt: string;
  openRisks: number;
  openIssues: number;
  /** Open issues at HIGH or CRITICAL severity — a subset of `openIssues`, never a separate pool. */
  attentionIssues: number;
  openSentinel: number;
}

export interface Portfolio {
  projects: PortfolioProject[];
  totals: {
    projects: number;
    openRisks: number;
    openIssues: number;
    attentionIssues: number;
    openSentinel: number;
  };
}

export async function getPortfolio(context: OrganizationContext): Promise<Portfolio> {
  await requirePortfolioAccess(context);

  const projects = await projectRepository.listProjectsByOrganization(context.organizationId);
  const counts = await portfolioRepository.countsByProject(projects.map((project) => project.id));

  const rows: PortfolioProject[] = projects.map((project) => {
    const projectCounts = counts.get(project.id) ?? {
      openRisks: 0,
      openIssues: 0,
      attentionIssues: 0,
      openSentinel: 0,
    };
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      ...projectCounts,
    };
  });

  return {
    projects: rows,
    totals: {
      projects: rows.length,
      openRisks: sum(rows, (row) => row.openRisks),
      openIssues: sum(rows, (row) => row.openIssues),
      attentionIssues: sum(rows, (row) => row.attentionIssues),
      openSentinel: sum(rows, (row) => row.openSentinel),
    },
  };
}

function sum(rows: PortfolioProject[], pick: (row: PortfolioProject) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
