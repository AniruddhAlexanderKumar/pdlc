import type { Metadata } from "next";
import { VerificationView } from "./_components/verification-view";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <VerificationView projectId={projectId} />;
}
