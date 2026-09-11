import type { Metadata } from "next";
import { ObservationsView } from "./_components/observations-view";

export const metadata: Metadata = { title: "Observations" };

export default async function ObservationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ObservationsView projectId={projectId} />;
}