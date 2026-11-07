import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/server/auth/context";
import { SignUpForm } from "../_components/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
};

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (await getAuthenticatedContext()) {
    redirect("/dashboard");
  }

  return <SignUpForm />;
}
