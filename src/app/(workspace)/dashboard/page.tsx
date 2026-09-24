import { PageHeader } from "@/components/common/page-header";
import { OrientationStrip } from "./_components/orientation-strip";
import { PersonalizedWorkflowWidget } from "./_components/personalized-workflow-widget";
import { ProjectsCard } from "./_components/projects-card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Pick up where you left off, or start with the project you need."
      />

      <PersonalizedWorkflowWidget />
      <ProjectsCard />
      <OrientationStrip />
    </div>
  );
}
