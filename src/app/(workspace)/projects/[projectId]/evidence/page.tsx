import type { Metadata } from "next";
import { EvidenceView } from "./_components/evidence-view";

export const metadata: Metadata = {
  title: "Evidence",
};

export default async function ProjectEvidencePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EvidenceView projectId={projectId} />;
}
