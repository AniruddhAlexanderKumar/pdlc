import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEducationPricing, calculatePricing } from '@sv/shared';
import { educationCategoryFromQuery, educationPreview } from './education';

describe('landing education offer', () => {
  it('uses the same monthly pricing as the request forms', () => {
    const preview = educationPreview();
    assert.equal(preview.studentCents, calculateEducationPricing('student', 1, 'monthly').effectiveStudentMonthlyCents);
    assert.equal(preview.cohortCents, calculateEducationPricing('cohort', 10, 'monthly').effectiveStudentMonthlyCents);
    assert.equal(preview.commercialCents, calculatePricing('individual', 1, 'monthly').effectiveMonthlyCents);
    assert.equal(preview.savings, 60);
  });
  it('recognises only the education deep link and defaults to commercial', () => {
    assert.equal(educationCategoryFromQuery('education'), 'education');
    assert.equal(educationCategoryFromQuery(null), 'commercial');
    assert.equal(educationCategoryFromQuery('invalid'), 'commercial');
  });
});
