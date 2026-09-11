import type { Metadata } from "next";
import { StakeholderNeedDetailView } from "../_components/stakeholder-need-detail-view";

export const metadata: Metadata = { title: "Stakeholder need" };

export default async function StakeholderNeedDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; needId: string }>;
}) {
  const { projectId, needId } = await params;
  return <StakeholderNeedDetailView projectId={projectId} needId={needId} />;
}
