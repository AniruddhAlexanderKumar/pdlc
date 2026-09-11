"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MINIMUM_PASSWORD_LENGTH, signUpRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { signUp } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthField, type FieldErrors, FormError, toFieldErrors } from "./auth-form";

/**
 * Registration: creates the organization and its first (administrator) user
 * in one step, and the server signs the caller in as part of the same
 * request — so there is no separate "now log in" hop.
 */
export function SignUpForm() {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = signUpRequestSchema.safeParse({ name, organizationName, email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      await signUp(parsed.data);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          Sets up your organization and your administrator account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError && <FormError message={formError} />}

          <AuthField
            id="organizationName"
            name="organizationName"
            label="Organization name"
            value={organizationName}
            onChange={setOrganizationName}
            error={fieldErrors["organizationName"]}
            autoComplete="organization"
            disabled={isSubmitting}
          />

          <AuthField
            id="name"
            name="name"
            label="Your name"
            value={name}
            onChange={setName}
            error={fieldErrors["name"]}
            autoComplete="name"
            disabled={isSubmitting}
          />

          <AuthField
            id="email"
            name="email"
            label="Work email"
            type="email"
            value={email}
            onChange={setEmail}
            error={fieldErrors["email"]}
            autoComplete="email"
            disabled={isSubmitting}
          />

          <AuthField
            id="password"
            name="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            error={fieldErrors["password"]}
            hint={`At least ${MINIMUM_PASSWORD_LENGTH} characters.`}
            autoComplete="new-password"
            disabled={isSubmitting}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
