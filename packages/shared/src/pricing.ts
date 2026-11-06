/** Versioned, integer-cent pricing. The server computes and stores this quote; clients never submit totals. */
export const PRICING_VERSION = "2026-11-01";
export const PLANS = ["individual", "small", "medium", "enterprise"] as const;
export const BILLING_PERIODS = [
  "monthly",
  "quarterly",
  "half-yearly",
  "annual",
] as const;
export type PricingPlan = (typeof PLANS)[number];
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export const BILLING = {
  monthly: { label: "Monthly", months: 1, discountPercent: 0 },
  quarterly: { label: "Quarterly", months: 3, discountPercent: 5 },
  "half-yearly": { label: "Half-yearly", months: 6, discountPercent: 10 },
  annual: { label: "Annually", months: 12, discountPercent: 20 },
} as const;
export const PLAN_CONFIG = {
  individual: {
    label: "Individual",
    minEditors: 1,
    maxEditors: 1,
    baseCents: 0,
    editorCents: 500,
  },
  small: {
    label: "Small Organisation",
    minEditors: 2,
    maxEditors: 49,
    baseCents: 1500,
    editorCents: 250,
  },
  medium: {
    label: "Medium Organisation",
    minEditors: 50,
    maxEditors: 199,
    baseCents: 4000,
    editorCents: 200,
  },
  enterprise: {
    label: "Enterprise",
    minEditors: 1,
    maxEditors: 100000,
    baseCents: null,
    editorCents: null,
  },
} as const;
export interface PricingQuote {
  version: string;
  currency: "USD";
  plan: PricingPlan;
  editors: number;
  billing: BillingPeriod;
  months: number;
  discountPercent: number | null;
  baseCents: number | null;
  editorCents: number | null;
  regularMonthlyCents: number | null;
  originalPeriodCents: number | null;
  discountCents: number | null;
  periodTotalCents: number | null;
  effectiveMonthlyCents: number | null;
}
export function calculatePricing(
  plan: PricingPlan,
  editors: number,
  billing: BillingPeriod,
): PricingQuote {
  const p = PLAN_CONFIG[plan];
  const b = BILLING[billing];
  if (
    !p ||
    !b ||
    !Number.isSafeInteger(editors) ||
    editors < p.minEditors ||
    editors > p.maxEditors
  )
    throw new RangeError("Editor count is not valid for the selected plan");
  const regular =
    p.baseCents === null || p.editorCents === null
      ? null
      : p.baseCents + p.editorCents * editors;
  const original = regular === null ? null : regular * b.months;
  const total =
    original === null
      ? null
      : Math.round((original * (100 - b.discountPercent)) / 100);
  return {
    version: PRICING_VERSION,
    currency: "USD",
    plan,
    editors,
    billing,
    months: b.months,
    discountPercent: plan === "enterprise" ? null : b.discountPercent,
    baseCents: p.baseCents,
    editorCents: p.editorCents,
    regularMonthlyCents: regular,
    originalPeriodCents: original,
    discountCents:
      original === null || total === null ? null : original - total,
    periodTotalCents: total,
    effectiveMonthlyCents: total === null ? null : Math.round(total / b.months),
  };
}
export function recommendedPlan(editors: number): PricingPlan {
  return editors <= 1
    ? "individual"
    : editors < 50
      ? "small"
      : editors < 200
        ? "medium"
        : "enterprise";
}
