import { z } from "zod";

/**
 * An organization's engineering industry — a selection, not a computation.
 *
 * This exists to identify which real-world engineering discipline an
 * organization works in. It is deliberately narrow in what it is allowed to
 * do: nothing about it changes any engineering result. A readiness verdict,
 * a Sentinel signal, a Change Impact finding, or a certification review is
 * identical whether an organization is AEROSPACE_DEFENSE or MEDICAL_DEVICES
 * or has no industry set at all — see `organization.service.ts` for where
 * this is read (display and, later, dashboard emphasis) and, just as
 * important, everywhere it is deliberately never read (every engineering
 * engine in `src/server/services/`).
 *
 * Fifteen concrete values, not an open taxonomy — `OTHER_ENGINEERING` (with
 * `industryOtherDetail`) is the honest way to name anything this list
 * doesn't cover, rather than forcing a bad fit or growing the enum forever.
 */
export const ENGINEERING_INDUSTRIES = [
  "AEROSPACE_DEFENSE",
  "AUTOMOTIVE",
  "MEDICAL_DEVICES",
  "INDUSTRIAL_EQUIPMENT",
  "ENERGY_POWER",
  "RAIL_TRANSIT",
  "MARITIME_SHIPBUILDING",
  "CONSTRUCTION_INFRASTRUCTURE",
  "ELECTRONICS_SEMICONDUCTOR",
  "TELECOMMUNICATIONS",
  "ROBOTICS_AUTOMATION",
  "CONSUMER_PRODUCTS",
  "CHEMICAL_PROCESS",
  "AGRICULTURAL_EQUIPMENT",
  "OTHER_ENGINEERING",
] as const;

export type EngineeringIndustry = (typeof ENGINEERING_INDUSTRIES)[number];

export const ENGINEERING_INDUSTRY_LABELS: Readonly<Record<EngineeringIndustry, string>> = {
  AEROSPACE_DEFENSE: "Aerospace & defense",
  AUTOMOTIVE: "Automotive",
  MEDICAL_DEVICES: "Medical devices",
  INDUSTRIAL_EQUIPMENT: "Industrial equipment",
  ENERGY_POWER: "Energy & power",
  RAIL_TRANSIT: "Rail & transit",
  MARITIME_SHIPBUILDING: "Maritime & shipbuilding",
  CONSTRUCTION_INFRASTRUCTURE: "Construction & infrastructure",
  ELECTRONICS_SEMICONDUCTOR: "Electronics & semiconductor",
  TELECOMMUNICATIONS: "Telecommunications",
  ROBOTICS_AUTOMATION: "Robotics & automation",
  CONSUMER_PRODUCTS: "Consumer products",
  CHEMICAL_PROCESS: "Chemical & process",
  AGRICULTURAL_EQUIPMENT: "Agricultural equipment",
  OTHER_ENGINEERING: "Other engineering discipline",
};

export function engineeringIndustryLabel(industry: EngineeringIndustry): string {
  return ENGINEERING_INDUSTRY_LABELS[industry];
}

const engineeringIndustrySchema = z.enum(
  ENGINEERING_INDUSTRIES as unknown as [EngineeringIndustry, ...EngineeringIndustry[]],
);

/**
 * Setting an organization's industry. `otherDetail` is required exactly
 * when `industry` is `OTHER_ENGINEERING` and rejected otherwise — enforced
 * here so a stray detail string can never silently attach itself to a real,
 * named industry, and so `OTHER_ENGINEERING` can never be set with nothing
 * to say what it actually means.
 */
export const setOrganizationIndustryRequestSchema = z
  .strictObject({
    industry: engineeringIndustrySchema,
    otherDetail: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.industry === "OTHER_ENGINEERING" && !value.otherDetail) {
      ctx.addIssue({
        code: "custom",
        path: ["otherDetail"],
        message: "Describe the engineering discipline when choosing Other.",
      });
    }
    if (value.industry !== "OTHER_ENGINEERING" && value.otherDetail) {
      ctx.addIssue({
        code: "custom",
        path: ["otherDetail"],
        message: "Only set a detail when the industry is Other engineering discipline.",
      });
    }
  });
export type SetOrganizationIndustryRequest = z.infer<typeof setOrganizationIndustryRequestSchema>;

/**
 * The core engineering nouns an organization may rename app-wide — its
 * sidebar navigation and each module's own page header, specifically (see
 * `resolveTerminologyLabel` below for exactly what reads this; it is a
 * deliberately small, high-visibility surface, not every string in the
 * product — see KNOWN_LIMITATIONS for the honest scope of what is not
 * retrofitted).
 *
 * Fixed set, not open-ended: these are the fourteen artifact modules that
 * read as an industry-flavored noun ("Risk", "Design item") rather than a
 * system feature or process name ("Command Center", "Decision Sentinel",
 * "Traceability", "Engineering History", "Members" stay fixed — renaming
 * those would rename the product's own capabilities, not the vocabulary
 * describing an organization's engineering work).
 */
export const TERMINOLOGY_LABEL_KEYS = [
  "stakeholderNeed",
  "requirement",
  "designItem",
  "verificationActivity",
  "evidence",
  "decision",
  "changeRequest",
  "risk",
  "issue",
  "supplier",
  "baseline",
  "observation",
  "drift",
  "certification",
] as const;

export type TerminologyLabelKey = (typeof TERMINOLOGY_LABEL_KEYS)[number];

/**
 * This product's own default label for each key — exactly the strings
 * already shown throughout the app before any organization customizes
 * anything. `resolveTerminologyLabel` falls back to these, so a key
 * missing from an organization's `labelOverrides` (the common case: most
 * organizations override nothing, or only one or two nouns) renders
 * identically to today.
 */
export const TERMINOLOGY_LABEL_DEFAULTS: Readonly<Record<TerminologyLabelKey, string>> = {
  stakeholderNeed: "Stakeholder needs",
  requirement: "Requirements",
  designItem: "Design items",
  verificationActivity: "Verification",
  evidence: "Evidence",
  decision: "Decisions",
  changeRequest: "Changes",
  risk: "Risks",
  issue: "Issues",
  supplier: "Suppliers",
  baseline: "Baselines",
  observation: "Observations",
  drift: "Drift",
  certification: "Certification",
};

export type TerminologyLabelOverrides = Partial<Record<TerminologyLabelKey, string>>;

/**
 * What actually renders for one label key: the organization's own override
 * when it set one, this product's default otherwise. The one function every
 * consumer (sidebar navigation, a module's page header) calls — so there is
 * exactly one place "what does an org's customization actually change"
 * could ever disagree with itself.
 */
export function resolveTerminologyLabel(
  key: TerminologyLabelKey,
  overrides: TerminologyLabelOverrides | null | undefined,
): string {
  const override = overrides?.[key]?.trim();
  return override ? override : TERMINOLOGY_LABEL_DEFAULTS[key];
}

const terminologyLabelKeySchema = z.enum(
  TERMINOLOGY_LABEL_KEYS as unknown as [TerminologyLabelKey, ...TerminologyLabelKey[]],
);

/**
 * Setting an organization's terminology overrides. A full replacement of
 * the map, not a patch — the same "one request, one clear resulting state"
 * shape `setOrganizationIndustryRequestSchema` uses, and simpler for a
 * form that always shows every key at once. An empty or whitespace-only
 * value for a key means "use the default" (filtered out server-side, in
 * `organization.service.ts`, rather than stored as a meaningless override)
 * — the honest way to let someone clear a field back to default without a
 * separate "reset" action per field.
 */
export const setOrganizationTerminologyRequestSchema = z.strictObject({
  overrides: z.partialRecord(terminologyLabelKeySchema, z.string().trim().max(60)),
});
export type SetOrganizationTerminologyRequest = z.infer<typeof setOrganizationTerminologyRequestSchema>;

/** What the profile endpoint returns — read access for any authenticated member of the organization. */
export interface OrganizationProfile {
  id: string;
  name: string;
  industry: EngineeringIndustry | null;
  industryOtherDetail: string | null;
  industrySetAt: string | null;
  industrySetBy: { id: string; name: string } | null;
  labelOverrides: TerminologyLabelOverrides;
  labelOverridesSetAt: string | null;
  labelOverridesSetBy: { id: string; name: string } | null;
}
