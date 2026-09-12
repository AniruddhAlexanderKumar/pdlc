import type { Metadata } from "next";
import { HistoryView } from "./_components/history-view";

export const metadata: Metadata = { title: "Engineering History" };

export default async function ProjectHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <HistoryView projectId={projectId} />;
}
