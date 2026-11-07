"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, FileCheck, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { canWriteProject } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useBases } from "@/lib/api/certification";
import { useProgram } from "@/lib/api/certification";
import { useMyProjectAccess } from "@/lib/api/project-membership";
import { useProject } from "@/lib/api/projects";
import {
  CertificationBasisStatusBadge,
  CertificationProgramStatusBadge,
} from "@/components/common/certification-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";
import { useModuleLabel } from "../../../../_components/terminology-context";
import { BasisFormDialog, ProgramFormDialog } from "./certification-form-dialogs";
import { BasisActionsMenu } from "./basis-actions";

/**
 * The certification workspace's overview: the internal certification
 * programme, and the certification bases tracked under it.
 *
 * Nothing here is a claim of regulatory approval — every status is an
 * internal workspace state, and there is no display of "certified" anywhere
 * on this page.
 */
export function CertificationView({ projectId }: { projectId: string }) {
  const title = useModuleLabel("certification", "Certification workspace");
  const program = useProgram(projectId);
  const bases = useBases(projectId);
  const project = useProject(projectId);
  const access = useMyProjectAccess(projectId);
  const [isProgramFormOpen, setIsProgramFormOpen] = React.useState(false);
  const [isBasisFormOpen, setIsBasisFormOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  // Convenience only — the server re-derives and enforces this on every
  // write regardless of what this hides.
  const canWrite = access.state.phase === "ready" && canWriteProject(access.state.data.role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/certification"
        title={title}
        description={
          projectName
            ? `Internal certification review for ${projectName}. This is not a claim of regulatory approval.`
            : "Internal certification review, built on the engineering system already recorded. This is not a claim of regulatory approval."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/certification/items`}>
                <ClipboardList aria-hidden="true" />
                Compliance items
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/certification/review`}>
                <ShieldCheck aria-hidden="true" />
                Certification review
              </Link>
            </Button>
          </div>
        }
      />

      {program.state.phase === "loading" && <LoadingState label="Loading certification programme…" />}

      {program.state.phase === "error" && (
        <EmptyState
          icon={<AlertTriangle aria-hidden="true" />}
          title="Could not load the certification programme"
          description={describeApiError(program.state.error)}
          action={<Button onClick={program.reload}>Retry</Button>}
        />
      )}

      {program.state.phase === "ready" && program.state.data === null && (
        <EmptyState
          icon={<FileCheck aria-hidden="true" />}
          title="No certification programme yet"
          description="Create the project's internal certification programme to start tracking obligations against a basis."
          action={
            canWrite ? (
              <Button onClick={() => setIsProgramFormOpen(true)}>
                <Plus aria-hidden="true" />
                Create programme
              </Button>
            ) : undefined
          }
        />
      )}

      {program.state.phase === "ready" && program.state.data !== null && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {program.state.data.name}
                  <CertificationProgramStatusBadge status={program.state.data.status} />
                </CardTitle>
                <CardDescription>
                  {program.state.data.identifier}
                  {program.state.data.description ? ` — ${program.state.data.description}` : ""}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsProgramFormOpen(true)}>
                Edit
              </Button>
            </CardHeader>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Certification bases</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={bases.reload}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setIsBasisFormOpen(true)}>
                <Plus aria-hidden="true" />
                New basis
              </Button>
            </div>
          </div>

          {bases.state.phase === "loading" && <LoadingState label="Loading bases…" />}

          {bases.state.phase === "ready" && bases.state.data.length === 0 && (
            <EmptyState
              icon={<FileCheck aria-hidden="true" />}
              title="No certification basis recorded yet"
              description="Record the certification standard being tracked — a document/authority reference, not its text."
              action={<Button onClick={() => setIsBasisFormOpen(true)}>Record basis</Button>}
            />
          )}

          {bases.state.phase === "ready" && bases.state.data.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const readyBases = bases.state.data;
                      return readyBases.map((basis) => (
                        <TableRow key={basis.id}>
                          <TableCell className="font-mono text-xs">{basis.identifier}</TableCell>
                          <TableCell>{basis.title}</TableCell>
                          <TableCell>{basis.revision}</TableCell>
                          <TableCell>
                            <CertificationBasisStatusBadge status={basis.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatIsoDate(basis.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <BasisActionsMenu
                              projectId={projectId}
                              basis={basis}
                              allBases={readyBases}
                              onChanged={bases.reload}
                            />
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ProgramFormDialog
        projectId={projectId}
        mode={program.state.phase === "ready" && program.state.data ? "edit" : "create"}
        program={program.state.phase === "ready" ? program.state.data ?? undefined : undefined}
        open={isProgramFormOpen}
        onOpenChange={setIsProgramFormOpen}
        onSaved={(saved) => {
          if (program.state.phase === "ready") program.set(saved);
          else program.reload();
        }}
      />

      <BasisFormDialog
        projectId={projectId}
        open={isBasisFormOpen}
        onOpenChange={setIsBasisFormOpen}
        onSaved={() => bases.reload()}
      />
    </div>
  );
}
