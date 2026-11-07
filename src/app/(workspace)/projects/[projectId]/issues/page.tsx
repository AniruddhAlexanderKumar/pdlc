import type { Metadata } from "next";
import { IssuesView } from "./_components/issues-view";

export const metadata: Metadata = {
  title: "Issues",
};

export default async function ProjectIssuesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <IssuesView projectId={projectId} />;
}
