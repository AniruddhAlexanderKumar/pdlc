import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { canViewPortfolio } from "@/domain";
import * as organizationService from "@/server/services/organization.service";
import { getAuthenticatedContext, toIdentity } from "@/server/auth/context";
import { Sidebar } from "./_components/sidebar";
import { TerminologyProvider } from "./_components/terminology-context";
import { TopBar } from "./_components/top-bar";
import { InteractiveOnboardingTour } from "./_components/interactive-onboarding-tour";
import { SituationAwareAI } from "./_components/situation-aware-ai";

/**
 * Shell for the authenticated application.
 *
 * This is the authoritative gate for every workspace page: the session is
 * resolved from the database here, on the server, before any child renders.
 * Middleware may have redirected already, but a present cookie proves nothing
 * — an expired or forged token is rejected at this point.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const context = await getAuthenticatedContext();

  if (!context) {
    redirect("/sign-in");
  }

  // Read-only, any-member access — same call `GET /api/organization/profile`
  // makes, just server-side so the sidebar and every page header have the
  // organization's terminology on first paint instead of a moment later.
  const profile = await organizationService.getOrganizationProfile(context);

  return (
    <TerminologyProvider overrides={profile.labelOverrides}>
      <div className="flex min-h-svh w-full">
        <Sidebar showPortfolio={canViewPortfolio(context.user.organizationRole)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar identity={toIdentity(context)} />
          {/*
            `min-w-0`: without it, `main` — a flex item of the column flex
            above — keeps its default flex min-width of `auto`, which lets a
            wide descendant (a data table with enough columns; found as a
            real 50px horizontal page overflow on certification's table at a
            390px viewport, not assumed) push `main` itself wider instead of
            being contained by the table's own `overflow-x-auto` wrapper.
            `min-w-0` is what lets that inner overflow actually do its job.
          */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>

        {/* Global workspace co-pilots */}
        <InteractiveOnboardingTour />
        <SituationAwareAI />
      </div>
    </TerminologyProvider>
  );
}
