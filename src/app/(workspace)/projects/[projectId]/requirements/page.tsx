import type { Metadata } from "next";
import { RequirementsView } from "./_components/requirements-view";

export const metadata: Metadata = {
  title: "Requirements",
};

export default async function ProjectRequirementsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <RequirementsView projectId={projectId} />;
}
