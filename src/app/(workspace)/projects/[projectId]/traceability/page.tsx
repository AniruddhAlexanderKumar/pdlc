import type { Metadata } from "next";
import { Suspense } from "react";
import { TraceabilityView } from "./_components/traceability-view";

export const metadata: Metadata = {
  title: "Traceability",
};

export default async function ProjectTraceabilityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    // The view reads ?type=/?id= via useSearchParams (a linked-in root from
    // another module's detail page — see traceability-view.tsx), which
    // requires a Suspense boundary in the App Router.
    <Suspense>
      <TraceabilityView projectId={projectId} />
    </Suspense>
  );
}
