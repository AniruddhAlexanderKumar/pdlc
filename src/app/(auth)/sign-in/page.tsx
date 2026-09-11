import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/server/auth/context";
import { SignInForm } from "../_components/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Already signed in? Skip the form.
  if (await getAuthenticatedContext()) {
    redirect("/dashboard");
  }

  return (
    // The form reads `?next=` via useSearchParams, which requires a Suspense
    // boundary in the App Router.
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
