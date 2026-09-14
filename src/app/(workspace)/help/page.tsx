import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { HelpView } from "./_components/help-view";

export const metadata: Metadata = {
  title: "Help",
};

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Help"
        description="What this system actually does, and how to read what it tells you. Nothing here is marketing copy — every claim below is something you can verify by using the product."
      />
      <HelpView />
    </div>
  );
}
