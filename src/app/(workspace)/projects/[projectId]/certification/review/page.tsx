import type { Metadata } from "next";
import { ReviewView } from "./_components/review-view";

export const metadata: Metadata = { title: "Certification review" };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ReviewView projectId={projectId} />;
}
