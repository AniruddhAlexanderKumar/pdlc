"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Boxes, Plus, RefreshCw } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useDesignItems } from "@/lib/api/artifacts";
import { useProject } from "@/lib/api/projects";
import { DesignItemStatusBadge, DesignItemTypeBadge } from "@/components/common/artifact-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";
import { DesignItemFormDialog } from "./design-item-form-dialog";

/** Design items for one project. Everything shown comes from the API. */
export function DesignItemsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { state, reload } = useDesignItems(projectId);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Design items"
        description={
          projectName
            ? `Product structure for ${projectName}. Requirements are allocated to these.`
            : "Product structure. Requirements are allocated to these."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New design item
          </Button>
        }
      />

      {state.phase === "loading" && <LoadingState label="Loading design items…" />}

      {state.phase === "error" && (
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
      )}

      {state.phase === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState
            icon={<Boxes aria-hidden="true" />}
            title="No design items yet"
            description="Add the elements of the product structure so requirements can be allocated to them."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                New design item
              </Button>
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Design items in this project, ordered by identifier.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/design-items/${item.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{item.name}</TableCell>
                  <TableCell>
                    <DesignItemTypeBadge itemType={item.itemType} />
                  </TableCell>
                  <TableCell>
                    <DesignItemStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.owner ? item.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={item.updatedAt}>
                    {formatIsoDate(item.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <DesignItemFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(item) => {
          reload();
          router.push(`/projects/${projectId}/design-items/${item.id}`);
        }}
      />
    </div>
  );
}
