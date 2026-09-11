import type { Metadata } from "next";
import { SentinelView } from "./_components/sentinel-view";

export const metadata: Metadata = { title: "Decision Sentinel" };

export default async function SentinelPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SentinelView projectId={projectId} />;
}
