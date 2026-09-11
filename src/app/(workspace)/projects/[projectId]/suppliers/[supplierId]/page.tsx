import type { Metadata } from "next";
import { SupplierDetailView } from "../_components/supplier-detail-view";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; supplierId: string }>;
}) {
  const { projectId, supplierId } = await params;
  return <SupplierDetailView projectId={projectId} supplierId={supplierId} />;
}
