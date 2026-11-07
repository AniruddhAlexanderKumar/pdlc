import type { Metadata } from "next";
import { IssueDetailView } from "../_components/issue-detail-view";

export const metadata: Metadata = {
  title: "Issue",
};

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}) {
  const { projectId, issueId } = await params;
  return <IssueDetailView projectId={projectId} issueId={issueId} />;
}
