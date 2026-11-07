import type { Metadata } from "next";
import { CertificationView } from "./_components/certification-view";

export const metadata: Metadata = { title: "Certification" };

export default async function CertificationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <CertificationView projectId={projectId} />;
}
