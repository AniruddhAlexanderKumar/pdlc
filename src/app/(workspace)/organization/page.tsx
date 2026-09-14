import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { getAuthenticatedContext } from "@/server/auth/context";
import { OrganizationProfileView } from "./_components/organization-profile-view";

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
        title="Organization"
        description={`${context.organization.name} — profile and engineering industry.`}
      />
      <OrganizationProfileView isOwner={context.user.organizationRole === "OWNER"} />
    </div>
  );
}
