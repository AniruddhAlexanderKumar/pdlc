import type { Metadata } from "next";
import { ItemsView } from "./_components/items-view";

export const metadata: Metadata = { title: "Compliance items" };

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ItemsView projectId={projectId} />;
}
