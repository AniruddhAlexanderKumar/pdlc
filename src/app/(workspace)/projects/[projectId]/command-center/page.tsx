import type { Metadata } from "next";
import { CommandCenterView } from "./_components/command-center-view";

export const metadata: Metadata = {
  title: "Command Center",
};

export default async function ProjectCommandCenterPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <CommandCenterView projectId={projectId} />;
}
