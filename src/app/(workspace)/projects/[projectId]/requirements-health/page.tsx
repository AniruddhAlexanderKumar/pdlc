import type { Metadata } from "next";
import { RequirementsHealthDashboard } from "./_components/requirements-health-dashboard";

export const metadata: Metadata = {
  title: "Requirements Health Dashboard",
  description: "Project-level requirements quality, stakeholder agreement coverage, and gatekeeper status.",
};

export default async function RequirementsHealthPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = await params;
  return <RequirementsHealthDashboard projectId={resolvedParams.projectId} />;
}
