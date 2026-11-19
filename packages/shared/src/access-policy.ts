/**
 * Account access policy.
 *
 * Solution Velocity has two independent concerns that are easy to confuse:
 *
 *  - **Entitlement** — what a paid subscription (when one exists) grants. The
 *    pricing, subscription and billing architecture is intentionally kept
 *    intact so paid plans can be introduced later without a rebuild.
 *  - **Access policy** — whether an ordinary new account may use the currently
 *    available product-development features *without* a paid subscription.
 *
 * The current launch period uses `beta-open`: registration is open and the
 * standard PDLC workspace (products, the seven-stage journey, projects,
 * materials, costs, XP) is available without payment. Nothing here deletes,
 * downgrades or rewrites subscription records; it only describes what a new,
 * unpaid account is allowed to do. Paid entitlements always take precedence,
 * so existing customers keep exactly what they have.
 *
 * Operators can change the policy with the `ACCESS_POLICY` environment
 * variable without a code change. See `DEPLOYMENT.md` and `SECURITY.md`.
 */

export const ACCESS_POLICIES = ['beta-open', 'registered', 'invite-only'] as const;
export type AccessPolicy = (typeof ACCESS_POLICIES)[number];

export interface AccessPolicyDefinition {
  id: AccessPolicy;
  /** One-line description, safe to show to prospective users. */
  summary: string;
  /** Whether an unrelated visitor may create an account and a workspace. */
  allowsOpenRegistration: boolean;
  /** Whether a new account needs an active paid subscription before use. */
  requiresPaidSubscription: boolean;
  /** Whether new accounts are granted the standard product-development workspace. */
  grantsStandardAccess: boolean;
}

export const ACCESS_POLICY_DEFINITIONS: Record<AccessPolicy, AccessPolicyDefinition> = {
  // The default: open registration, standard PDLC functionality, no payment step.
  'beta-open': {
    id: 'beta-open',
    summary: 'Open registration during the launch period. No payment details are required.',
    allowsOpenRegistration: true,
    requiresPaidSubscription: false,
    grantsStandardAccess: true
  },
  // Open registration for a private deployment, without advertising a launch programme.
  registered: {
    id: 'registered',
    summary: 'Open registration. No payment details are required.',
    allowsOpenRegistration: true,
    requiresPaidSubscription: false,
    grantsStandardAccess: true
  },
  // The pre-launch default: accounts are created by invitation only.
  'invite-only': {
    id: 'invite-only',
    summary: 'Invitation only. An existing workspace owner or administrator must invite you.',
    allowsOpenRegistration: false,
    requiresPaidSubscription: false,
    grantsStandardAccess: true
  }
};

export const DEFAULT_ACCESS_POLICY: AccessPolicy = 'beta-open';

/** The portion of the policy that is safe to expose to the browser. */
export interface AccessPolicyStatus {
  policy: AccessPolicy;
  /** Whether the policy currently lets a visitor create an account here. */
  openRegistration: boolean;
  /** Whether a payment step is required before the account can be used. */
  paymentRequired: boolean;
  /** How much of the standard product-development workspace a new account gets. */
  standardAccess: 'full' | 'none';
  registrationEmailVerification: 'required' | 'optional';
  /** True while the standard workspace is available without a paid plan. */
  launchPeriod: boolean;
  /** Plain-English sentence for marketing copy. */
  summary: string;
}

/**
 * Describes what a new account receives. `entitled` means the account already
 * has a recognised paid entitlement; those are never downgraded by this
 * function — an entitled account keeps full access under every policy.
 */
export function accessStatusFor(policy: AccessPolicy, entitled = false): AccessPolicyStatus {
  const definition = ACCESS_POLICY_DEFINITIONS[policy] ?? ACCESS_POLICY_DEFINITIONS[DEFAULT_ACCESS_POLICY];
  const standard = definition.grantsStandardAccess || entitled;
  return {
    policy: definition.id,
    openRegistration: definition.allowsOpenRegistration,
    paymentRequired: entitled ? false : definition.requiresPaidSubscription,
    standardAccess: standard ? 'full' : 'none',
    registrationEmailVerification: policy === 'beta-open' ? 'optional' : 'required',
    launchPeriod: policy === 'beta-open',
    summary: definition.summary
  };
}

export function isAccessPolicy(value: unknown): value is AccessPolicy {
  return typeof value === 'string' && (ACCESS_POLICIES as readonly string[]).includes(value);
}
