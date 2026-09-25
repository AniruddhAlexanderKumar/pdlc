import { PageHeader } from "@/components/common/page-header";
import { OrientationStrip } from "./_components/orientation-strip";
import { ProjectsCard } from "./_components/projects-card";

/**
 * Where everyone lands after signing in.
 *
 * Two things, in the order a newcomer needs them: your projects, each with
 * the one thing to do next in it; then a short explanation of the stages
 * those next steps come from. A "personalized workflow widget" used to sit
 * above both, repeating a second, different "3-step workflow" and linking
 * to a simulated store integration — removed along with it.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Your projects, and what to do next in each."
      />

      <ProjectsCard />
      <OrientationStrip />
    </div>
  );
}
