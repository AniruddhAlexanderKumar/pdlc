import type { ReactNode } from "react";
import { Shell } from "@/components/common/shell";
import { DocsSidebar } from "./_components/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Shell className="flex flex-col gap-8 py-10 lg:flex-row lg:items-start lg:gap-12">
      {/* Sidebar nav and search are navigation chrome, not content — an
          engineer printing a deployment guide for a change board wants the
          guide, not a printed nav rail with a search box that does nothing
          on paper. */}
      <div className="print:hidden">
        <DocsSidebar />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Shell>
  );
}
