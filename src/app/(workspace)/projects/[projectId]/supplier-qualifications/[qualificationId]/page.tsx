import type { Metadata } from "next";
import { QualificationDetailView } from "../../suppliers/_components/qualification-detail-view";

export const metadata: Metadata = { title: "Supplier qualification" };

export default async function QualificationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; qualificationId: string }>;
}) {
  const { projectId, qualificationId } = await params;
  return <QualificationDetailView projectId={projectId} qualificationId={qualificationId} />;
}
