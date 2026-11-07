import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { getAuthenticatedContext } from "@/server/auth/context";
import { SettingsView } from "./_components/settings-view";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="How this application looks and behaves for you, in this browser."
      />
      <SettingsView isOwner={context.user.organizationRole === "OWNER"} />
    </div>
  );
}
