import type { Metadata } from "next";
import { EvidenceDetailView } from "../_components/evidence-detail-view";

export const metadata: Metadata = {
  title: "Evidence",
};

export default async function ProjectEvidenceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; evidenceId: string }>;
}) {
  const { projectId, evidenceId } = await params;
  return <EvidenceDetailView projectId={projectId} evidenceId={evidenceId} />;
}
