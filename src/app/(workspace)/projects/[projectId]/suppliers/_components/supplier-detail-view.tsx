"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, History, Package, Pencil, Plus, RefreshCw } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useSupplier } from "@/lib/api/suppliers";
import { ArtifactHistory, DetailField } from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import {
  QualificationStatusBadge,
  QualificationTypeBadge,
  SuppliedItemStatusBadge,
  SuppliedItemTypeBadge,
  SupplierStatusBadge,
} from "@/components/common/supplier-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { QualificationFormDialog } from "./qualification-form-dialog";
import { SuppliedItemFormDialog } from "./supplied-item-form-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";

/**
 * One supplier: what they provide, what qualifies them, and what has happened
 * to the record.
 *
 * The supplier's status and its qualifications' statuses are shown side by side
 * without being reconciled. ACTIVE supplier with an EXPIRED qualification is a
 * real and meaningful state, and blending the two into one indicator would
 * destroy the distinction.
 */
export function SupplierDetailView({
  projectId,
  supplierId,
}: {
  projectId: string;
  supplierId: string;
}) {
  const router = useRouter();
  const { state, reload } = useSupplier(projectId, supplierId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isItemOpen, setIsItemOpen] = React.useState(false);
  const [isQualOpen, setIsQualOpen] = React.useState(false);

  if (state.phase === "loading") return <LoadingState label="Loading supplier…" />;

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

  const supplier = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={supplier.name}
        description={`Supplier ${supplier.identifier}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/suppliers`}>
                <ArrowLeft aria-hidden="true" />
                All suppliers
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/history/SUPPLIER/${supplier.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Supplier record</CardTitle>
          <CardDescription>
            An engineering dependency, not a commercial relationship. No contract, order or vendor
            assessment is recorded here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{supplier.identifier}</span>
            </DetailField>
            <DetailField term="Status">
              <SupplierStatusBadge status={supplier.status} />
            </DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={supplier.createdAt}>
                {formatIsoDate(supplier.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Updated">
              <span className="font-mono" title={supplier.updatedAt}>
                {formatIsoDate(supplier.updatedAt)}
              </span>
            </DetailField>
          </dl>

          {supplier.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">
              {supplier.description}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Supplied items</CardTitle>
            <CardDescription>
              What this supplier provides. These are the records that participate in the
              engineering graph.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIsItemOpen(true)}>
            <Plus aria-hidden="true" />
            New supplied item
          </Button>
        </CardHeader>
        <CardContent>
          {supplier.suppliedItems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="size-4 shrink-0" aria-hidden="true" />
              Nothing recorded yet. A supplier reaches engineering through what it supplies, so a
              change to this supplier will find nothing until an item is added.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {supplier.suppliedItems.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/projects/${projectId}/supplied-items/${item.id}`}
                    className="min-w-0 truncate text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    <span className="font-mono">{item.identifier}</span> — {item.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <SuppliedItemTypeBadge itemType={item.itemType} />
                    <SuppliedItemStatusBadge status={item.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Qualifications</CardTitle>
            <CardDescription>
              What establishes suitability. Statuses are shown exactly as recorded — nothing here is
              derived from a supplier&rsquo;s status or from an expiry date.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setIsQualOpen(true)}>
            <Plus aria-hidden="true" />
            New qualification
          </Button>
        </CardHeader>
        <CardContent>
          {supplier.qualifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No qualifications recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {supplier.qualifications.map((qualification) => (
                <li
                  key={qualification.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <Link
                    href={`/projects/${projectId}/supplier-qualifications/${qualification.id}`}
                    className="min-w-0 truncate text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    {qualification.title}
                    {qualification.suppliedItem && (
                      <span className="text-muted-foreground">
                        {" "}
                        · <span className="font-mono">{qualification.suppliedItem.identifier}</span>
                      </span>
                    )}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <QualificationTypeBadge
                      qualificationType={qualification.qualificationType}
                    />
                    <QualificationStatusBadge status={qualification.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ArtifactHistory events={supplier.history} />

      <SupplierFormDialog
        mode="edit"
        projectId={projectId}
        supplier={supplier}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />

      <SuppliedItemFormDialog
        mode="create"
        projectId={projectId}
        supplierId={supplier.id}
        open={isItemOpen}
        onOpenChange={setIsItemOpen}
        onSaved={(item) => {
          reload();
          router.push(`/projects/${projectId}/supplied-items/${item.id}`);
        }}
      />

      <QualificationFormDialog
        mode="create"
        projectId={projectId}
        supplierId={supplier.id}
        open={isQualOpen}
        onOpenChange={setIsQualOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
