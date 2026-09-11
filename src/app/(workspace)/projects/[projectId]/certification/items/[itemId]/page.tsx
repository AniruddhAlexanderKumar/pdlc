import type { Metadata } from "next";
import { ItemDetailView } from "./_components/item-detail-view";

export const metadata: Metadata = { title: "Compliance item" };

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; itemId: string }>;
}) {
  const { projectId, itemId } = await params;
  return <ItemDetailView projectId={projectId} itemId={itemId} />;
}
