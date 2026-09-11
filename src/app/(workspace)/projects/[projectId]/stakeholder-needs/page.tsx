import type { Metadata } from "next";
import { StakeholderNeedsView } from "./_components/stakeholder-needs-view";

export const metadata: Metadata = { title: "Stakeholder needs" };

export default async function StakeholderNeedsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <StakeholderNeedsView projectId={projectId} />;
}
