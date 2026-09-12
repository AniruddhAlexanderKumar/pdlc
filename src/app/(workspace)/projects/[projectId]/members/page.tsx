import type { Metadata } from "next";
import { MembersView } from "./_components/members-view";

export const metadata: Metadata = {
  title: "Members",
};

export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <MembersView projectId={projectId} />;
}
