import { PageHeader } from "@/components/common/page-header";
import { OrientationStrip } from "./_components/orientation-strip";
import { ProjectsCard } from "./_components/projects-card";

/**
 * The first screen after signing in.
 *
 * It used to open with a System Health card — database reachability and
 * query latency — above a list of project names. That is real information,
 * but it answers an operator's question, not the question the person who
 * just signed in is actually asking, and it took the most prominent
 * position on the page to do it. It now lives on the Organization page's
 * System tab, with the administration it belongs to; this page leads with
 * the projects you can open and one clear way into each.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Pick up where you left off, or start with the project you need."
      />

      <ProjectsCard />
      <OrientationStrip />
    </div>
  );
}
