import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { getAuthenticatedContext } from "@/server/auth/context";
import { OrganizationTabs } from "./_components/organization-tabs";

export const metadata: Metadata = {
  title: "Organization",
};

export default async function OrganizationPage() {
  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={context.organization.name}
        description="Who belongs to this organization, and the settings that apply to everyone in it."
      />
      <OrganizationTabs isOwner={context.user.organizationRole === "OWNER"} />
    </div>
  );
}
