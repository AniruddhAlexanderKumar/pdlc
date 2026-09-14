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

/** What the profile endpoint returns — read access for any authenticated member of the organization. */
export interface OrganizationProfile {
  id: string;
  name: string;
  industry: EngineeringIndustry | null;
  industryOtherDetail: string | null;
  industrySetAt: string | null;
  industrySetBy: { id: string; name: string } | null;
}
