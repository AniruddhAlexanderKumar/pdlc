import type { Metadata } from "next";
import { RequirementDetailView } from "../_components/requirement-detail-view";

export const metadata: Metadata = {
  title: "Requirement",
};

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; requirementId: string }>;
}) {
  const { projectId, requirementId } = await params;
  return <RequirementDetailView projectId={projectId} requirementId={requirementId} />;
}
