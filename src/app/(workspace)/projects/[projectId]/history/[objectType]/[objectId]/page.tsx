import type { Metadata } from "next";
import { ObjectHistoryView } from "../../_components/object-history-view";

export const metadata: Metadata = { title: "Object History" };

export default async function ObjectHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string; objectType: string; objectId: string }>;
}) {
  const { projectId, objectType, objectId } = await params;
  return <ObjectHistoryView projectId={projectId} objectType={objectType} objectId={objectId} />;
}
