import { z } from "zod";
import { entityIdSchema } from "./shared/identifier";

/**
 * Authentication contracts.
 *
 * Prisma-free like the rest of the domain, so the sign-in and sign-up forms
 * validate against exactly the schemas the API enforces.
 */

/**
 * Canonical email form. Addresses are compared and stored lowercase so
 * "Ada@Example.com" and "ada@example.com" cannot become two accounts.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, "An email address is required")
  .max(254, "That email address is too long")
  .email("Enter a valid email address")
  .transform(normalizeEmail);

/**
 * Length is the only rule. Composition requirements ("one symbol, one
 * digit") push people toward predictable substitutions without meaningfully
 * raising entropy, so we ask for length instead.
 */
export const MINIMUM_PASSWORD_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(MINIMUM_PASSWORD_LENGTH, `Use at least ${MINIMUM_PASSWORD_LENGTH} characters`)
  // Bounded because Argon2 hashes whatever it is given, and an unbounded
  // input is an easy way to burn server CPU.
  .max(256, "That password is too long");

export const signUpRequestSchema = z.strictObject({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(1, "An organization name is required").max(200),
});

export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

export const signInRequestSchema = z.strictObject({
  email: emailSchema,
  // Deliberately not `passwordSchema`: rejecting a short password at sign-in
  // with a length message would leak nothing useful and only confuse someone
  // whose account predates a rule change. Any non-empty value is checked.
  password: z.string().min(1, "Your password is required"),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;

/**
 * The only identity shape ever sent to the browser.
 *
 * No password hash, no session token, no internal credential state — adding a
 * field here is a deliberate act, whereas serialising a Prisma user would leak
 * whatever the schema happens to hold.
 */
export interface AuthenticatedIdentity {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    /** Organization-level access role (OWNER/MEMBER) — see `src/domain/access-control.ts`. */
    organizationRole: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

export const authenticatedIdentitySchema = z.object({
  user: z.object({
    id: entityIdSchema,
    name: z.string(),
    email: z.string(),
    role: z.string(),
    organizationRole: z.string(),
  }),
  organization: z.object({
    id: entityIdSchema,
    name: z.string(),
  }),
}) satisfies z.ZodType<AuthenticatedIdentity>;
