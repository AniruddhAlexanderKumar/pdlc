import type { Metadata } from "next";
import { TraceabilityView } from "./_components/traceability-view";

export const metadata: Metadata = {
  title: "Traceability",
};

export default async function ProjectTraceabilityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <TraceabilityView projectId={projectId} />;
}
