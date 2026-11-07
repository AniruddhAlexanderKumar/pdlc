import type { Metadata } from "next";
import { ChangeDetailView } from "../_components/change-detail-view";

export const metadata: Metadata = { title: "Change request" };

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; changeId: string }>;
}) {
  const { projectId, changeId } = await params;
  return <ChangeDetailView projectId={projectId} changeId={changeId} />;
}
