import type { Metadata } from "next";
import { DecisionDetailView } from "../_components/decision-detail-view";

export const metadata: Metadata = { title: "Decision" };

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; decisionId: string }>;
}) {
  const { projectId, decisionId } = await params;
  return <DecisionDetailView projectId={projectId} decisionId={decisionId} />;
}
