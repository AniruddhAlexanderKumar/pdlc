import { BILLING, type BillingPeriod } from './pricing.js';
export const EDUCATION_PRICING_VERSION = '2026-11-02';
export const EDUCATION_PLANS = ['student','cohort','education_enterprise'] as const;
export type EducationPlan = typeof EDUCATION_PLANS[number];
export const EDUCATION_CONFIG = {
  student: {label:'Individual Student', min:1, max:1, studentCents:200},
  cohort: {label:'School / Institutional Cohort', min:10, max:100, studentCents:150},
  education_enterprise: {label:'Institutional / Education Enterprise', min:1, max:100000, studentCents:null}
} as const;
/** Institutional seat rates are already discounted. Configure any future period discounts here. */
export const COHORT_PERIOD_DISCOUNTS: Record<BillingPeriod, number> = {monthly:0,quarterly:0,'half-yearly':0,annual:0};
export interface EducationPricingQuote {
  category:'education'; version:string; currency:'USD'; plan:EducationPlan; students:number; billing:BillingPeriod; months:number;
  studentCents:number|null; regularMonthlyCents:number|null; discountPercent:number|null; originalPeriodCents:number|null; discountCents:number|null; periodTotalCents:number|null; effectiveMonthlyCents:number|null; effectiveStudentMonthlyCents:number|null;
}
export function calculateEducationPricing(plan:EducationPlan,students:number,billing:BillingPeriod):EducationPricingQuote {
 const p=EDUCATION_CONFIG[plan], b=BILLING[billing];
 if(!p||!b||!Number.isSafeInteger(students)||students<p.min||students>p.max)throw new RangeError('Student count is not valid for the selected education plan');
 const regular=p.studentCents===null?null:p.studentCents*students;
 const discount=plan==='education_enterprise'?null:plan==='cohort'?COHORT_PERIOD_DISCOUNTS[billing]:b.discountPercent;
 const original=regular===null?null:regular*b.months;
 const total=original===null||discount===null?null:Math.round(original*(100-discount)/100);
 return {category:'education',version:EDUCATION_PRICING_VERSION,currency:'USD',plan,students,billing,months:b.months,studentCents:p.studentCents,regularMonthlyCents:regular,discountPercent:discount,originalPeriodCents:original,discountCents:original===null||total===null?null:original-total,periodTotalCents:total,effectiveMonthlyCents:total===null?null:Math.round(total/b.months),effectiveStudentMonthlyCents:total===null?null:Math.round(total/b.months/students)};
}
