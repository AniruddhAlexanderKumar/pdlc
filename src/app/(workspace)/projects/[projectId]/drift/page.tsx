import type { Metadata } from "next";
import { DriftView } from "./_components/drift-view";

export const metadata: Metadata = { title: "Drift" };

export default async function DriftPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DriftView projectId={projectId} />;
}