import type { Metadata } from "next";
import { RisksView } from "./_components/risks-view";

export const metadata: Metadata = {
  title: "Risks",
};

export default async function ProjectRisksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <RisksView projectId={projectId} />;
}
