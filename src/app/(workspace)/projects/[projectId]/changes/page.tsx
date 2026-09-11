import type { Metadata } from "next";
import { ChangesView } from "./_components/changes-view";

export const metadata: Metadata = { title: "Changes" };

export default async function ChangesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ChangesView projectId={projectId} />;
}
