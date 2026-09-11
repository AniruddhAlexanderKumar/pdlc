import type { Metadata } from "next";
import { DesignItemsView } from "./_components/design-items-view";

export const metadata: Metadata = { title: "Design items" };

export default async function DesignItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DesignItemsView projectId={projectId} />;
}
