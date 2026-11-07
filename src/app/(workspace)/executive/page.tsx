import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canViewPortfolio } from "@/domain";
import { PageHeader } from "@/components/common/page-header";
import { getAuthenticatedContext } from "@/server/auth/context";
import { ExecutiveView } from "./_components/executive-view";

export const metadata: Metadata = {
  title: "Executive",
};

/**
 * Gated here as well as on the API it reads.
 *
 * `notFound()` rather than a "you may not see this" page, matching the
 * 404-not-403 convention the rest of this codebase uses for a surface a
 * caller has no access to at all: a member should not learn that an
 * executive portfolio exists from being refused it. The API behind it
 * refuses independently (`requirePortfolioAccess`), so this check is the
 * courtesy, not the enforcement.
 */
export default async function ExecutivePage() {
  const context = await getAuthenticatedContext();
  if (!context) {
    redirect("/sign-in");
  }
  if (!canViewPortfolio(context.user.organizationRole)) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Executive"
        description="Every project in this organization, with its real open counts. No scores, no ranking — open a project to read what the numbers mean."
      />
      <ExecutiveView />
    </div>
  );
}
