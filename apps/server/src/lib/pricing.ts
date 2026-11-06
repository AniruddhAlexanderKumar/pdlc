import { z } from "zod";
import { BILLING_PERIODS, PLANS, calculatePricing } from "@sv/shared";
export const pricingSelection = z
  .object({
    plan: z.enum(PLANS),
    editors: z.number().int().min(1).max(100000),
    billing: z.enum(BILLING_PERIODS),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      calculatePricing(value.plan, value.editors, value.billing);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Editor count does not match the selected plan",
      });
    }
  });

import { EDUCATION_PLANS, calculateEducationPricing } from '@sv/shared';
export const educationPricingSelection = z.object({ plan:z.enum(EDUCATION_PLANS), students:z.number().int().min(1).max(100000), billing:z.enum(BILLING_PERIODS) }).strict().superRefine((value,ctx)=>{
  try { calculateEducationPricing(value.plan,value.students,value.billing); } catch { ctx.addIssue({code:'custom',message:'Student count does not match the selected education plan'}); }
});
