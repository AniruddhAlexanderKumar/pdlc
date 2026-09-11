import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export interface ModuleStubPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Shared shape for nav-linked modules that are scaffolded but not yet
 * implemented (requirements, architecture, verification, changes, audit).
 * Intentionally has zero domain logic — see ARCHITECTURE.md.
 */
function ModuleStubPage({ title, description, icon: Icon }: ModuleStubPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<Icon aria-hidden="true" />}
        title="Module not yet implemented"
        description="This area of the shell is scaffolded and reachable from navigation. Domain functionality lands in a future engineering phase."
      />
    </div>
  );
}

export { ModuleStubPage };
