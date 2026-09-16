"use client";

import Link from "next/link";
import { AlertTriangle, Eye, FolderGit2, RefreshCw, ShieldAlert } from "lucide-react";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { type PortfolioProjectDto, usePortfolio } from "@/lib/api/portfolio";
import { cn, formatIsoDate } from "@/lib/utils";

/**
 * The portfolio: every project in the organization, side by side.
 *
 * Deliberately absent: any overall figure for the organization, any
 * ranking of projects against each other, and any colour that means
 * "trouble" on its own. Each number below is a real count of real rows,
 * identical to the one that project's own Command Center shows, and each
 * links straight there — because the honest answer to "is this project in
 * trouble" is always "open it and read", never a number this page could
 * have invented on the way past.
 *
 * The totals row is a sum, and nothing more: it adds up counts that are
 * each individually meaningful. It is not a score, and a larger total is
 * not "worse" — a programme with more projects will have more of
 * everything.
 */
export function ExecutiveView() {
  const { state, reload } = usePortfolio();

  if (state.phase === "loading") {
    return <LoadingState label="Loading portfolio…" />;
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
      >
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </p>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  const { projects, totals } = state.data;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FolderGit2 aria-hidden="true" />}
        title="No projects yet"
        description="Once this organization has projects, every one of them appears here with its real open counts."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TotalTile label="Projects" value={totals.projects} />
        <TotalTile label="Open risks" value={totals.openRisks} />
        <TotalTile label="Open issues" value={totals.openIssues} detail={`${totals.attentionIssues} high or critical`} />
        <TotalTile label="Sentinel open" value={totals.openSentinel} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Projects</h2>
        <div className="flex flex-col gap-3">
          {projects.map((project) => (
            <PortfolioRow key={project.id} project={project} />
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Every count above is the same number that project&apos;s own Command Center shows, read from
        the same rows. Nothing on this page is scored, ranked, or weighted.
      </p>
    </div>
  );
}

function TotalTile({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-4">
      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

function PortfolioRow({ project }: { project: PortfolioProjectDto }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/projects/${project.id}/command-center`}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {project.name}
          </Link>
          {project.description && (
            <span className="line-clamp-1 text-xs text-muted-foreground">{project.description}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated <span className="font-mono">{formatIsoDate(project.updatedAt)}</span>
          </span>
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Count icon={ShieldAlert} label="open risks" value={project.openRisks} />
        <Count
          icon={AlertTriangle}
          label="open issues"
          value={project.openIssues}
          detail={project.attentionIssues > 0 ? `${project.attentionIssues} high/critical` : undefined}
        />
        <Count icon={Eye} label="sentinel open" value={project.openSentinel} />
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href={`/projects/${project.id}/command-center`}>Open Command Center</Link>
        </Button>
      </div>
    </div>
  );
}

function Count({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ShieldAlert;
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <Icon
        className={cn("size-4 shrink-0", value > 0 ? "text-muted-foreground" : "text-muted-foreground/40")}
        aria-hidden="true"
      />
      <span className="font-mono tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
      {detail && <span className="text-xs text-muted-foreground">({detail})</span>}
    </span>
  );
}
