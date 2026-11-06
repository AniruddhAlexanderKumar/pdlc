import { calculateEducationPricing, calculatePricing } from '@sv/shared';

/** Use the same pricing engines as the access request, so marketing cannot drift. */
export function educationPreview() {
  const student = calculateEducationPricing('student', 1, 'monthly');
  const cohort = calculateEducationPricing('cohort', 10, 'monthly');
  const commercial = calculatePricing('individual', 1, 'monthly');
  const studentCents = student.effectiveStudentMonthlyCents;
  const cohortCents = cohort.effectiveStudentMonthlyCents;
  const commercialCents = commercial.effectiveMonthlyCents;
  const savings = studentCents !== null && commercialCents !== null && commercialCents > 0 && studentCents < commercialCents
    ? Math.round((commercialCents - studentCents) * 100 / commercialCents)
    : null;
  return { studentCents, cohortCents, commercialCents, savings };
}
export function educationCategoryFromQuery(value: string | null): 'education' | 'commercial' {
  return value === 'education' ? 'education' : 'commercial';
}
