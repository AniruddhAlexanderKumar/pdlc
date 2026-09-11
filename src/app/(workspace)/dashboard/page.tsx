import { PageHeader } from "@/components/common/page-header";
import { ProjectsCard } from "./_components/projects-card";
import { SystemHealthCard } from "./_components/system-health-card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Program overview. Everything shown here is read from the database — nothing is simulated."
      />

      <SystemHealthCard />
      <ProjectsCard />
    </div>
  );
}
