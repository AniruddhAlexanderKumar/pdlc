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
        description="Start with the task you're trying to finish. The ideas behind the product, and a live look at the real engine, are one tab over."
      />
      <HelpView />
    </div>
  );
}
