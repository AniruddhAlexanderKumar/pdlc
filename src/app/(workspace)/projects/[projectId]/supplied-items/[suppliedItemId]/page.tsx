import type { Metadata } from "next";
import { SuppliedItemDetailView } from "../../suppliers/_components/supplied-item-detail-view";

export const metadata: Metadata = { title: "Supplied item" };

export default async function SuppliedItemDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; suppliedItemId: string }>;
}) {
  const { projectId, suppliedItemId } = await params;
  return <SuppliedItemDetailView projectId={projectId} suppliedItemId={suppliedItemId} />;
}
