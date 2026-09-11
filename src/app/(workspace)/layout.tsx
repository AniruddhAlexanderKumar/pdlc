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
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
