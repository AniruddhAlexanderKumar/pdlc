import type { Metadata } from "next";
import { RiskDetailView } from "../_components/risk-detail-view";

export const metadata: Metadata = {
  title: "Risk",
};

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; riskId: string }>;
}) {
  const { projectId, riskId } = await params;
  return <RiskDetailView projectId={projectId} riskId={riskId} />;
}
