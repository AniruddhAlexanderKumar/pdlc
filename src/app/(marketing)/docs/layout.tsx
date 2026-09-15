import type { ReactNode } from "react";
import { Shell } from "@/components/common/shell";
import { DocsSidebar } from "./_components/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Shell className="flex flex-col gap-8 py-10 lg:flex-row lg:items-start lg:gap-12">
      <DocsSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </Shell>
  );
}
