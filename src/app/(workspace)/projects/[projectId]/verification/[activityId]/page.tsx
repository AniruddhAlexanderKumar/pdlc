import type { Metadata } from "next";
import { VerificationDetailView } from "../_components/verification-detail-view";

export const metadata: Metadata = { title: "Verification activity" };

export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; activityId: string }>;
}) {
  const { projectId, activityId } = await params;
  return <VerificationDetailView projectId={projectId} activityId={activityId} />;
}
