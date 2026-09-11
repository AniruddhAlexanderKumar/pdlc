import type { Metadata } from "next";
import { BaselineDetailView } from "../_components/baseline-detail-view";

export const metadata: Metadata = { title: "Baseline" };

export default async function BaselineDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; baselineId: string }>;
}) {
  const { projectId, baselineId } = await params;
  return <BaselineDetailView projectId={projectId} baselineId={baselineId} />;
}