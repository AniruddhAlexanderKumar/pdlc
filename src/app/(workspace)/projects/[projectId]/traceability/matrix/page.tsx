import type { Metadata } from "next";
import { TraceabilityMatrixView } from "../_components/traceability-matrix-view";

export const metadata: Metadata = {
  title: "Verification Coverage Matrix",
};

export default async function TraceabilityMatrixPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <TraceabilityMatrixView projectId={projectId} />;
}
