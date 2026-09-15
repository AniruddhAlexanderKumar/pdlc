import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthenticatedContext, toIdentity } from "@/server/auth/context";
import { Sidebar } from "./_components/sidebar";
import { TopBar } from "./_components/top-bar";

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

  return (
    <div className="flex min-h-svh w-full">
      <Sidebar />
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
    </div>
  );
}
