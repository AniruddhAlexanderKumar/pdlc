import type { Metadata } from "next";
import { DesignItemDetailView } from "../_components/design-item-detail-view";

export const metadata: Metadata = { title: "Design item" };

export default async function DesignItemDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; designItemId: string }>;
}) {
  const { projectId, designItemId } = await params;
  return <DesignItemDetailView projectId={projectId} designItemId={designItemId} />;
}
