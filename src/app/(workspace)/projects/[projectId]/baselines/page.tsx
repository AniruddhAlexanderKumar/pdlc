import type { Metadata } from "next";
import { BaselinesView } from "./_components/baselines-view";

export const metadata: Metadata = { title: "Baselines" };

export default async function BaselinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <BaselinesView projectId={projectId} />;
}