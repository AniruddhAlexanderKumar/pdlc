import {describe,it} from 'node:test';import assert from 'node:assert/strict';
import {calculateEducationPricing} from './education-pricing.js';import {BILLING_PERIODS} from './pricing.js';
describe('education pricing',()=>{
 it('calculates individual standard discounts',()=>{assert.deepEqual(BILLING_PERIODS.map(b=>calculateEducationPricing('student',1,b).periodTotalCents),[200,570,1080,1920]);});
 it('does not stack cohort billing discounts',()=>{for(const n of [10,20,30,50,75,100])for(const b of BILLING_PERIODS){const q=calculateEducationPricing('cohort',n,b);assert.equal(q.discountPercent,0);assert.equal(q.periodTotalCents,n*150*q.months);}});
 it('validates limits and keeps enterprise custom',()=>{assert.throws(()=>calculateEducationPricing('cohort',9,'annual'));assert.throws(()=>calculateEducationPricing('cohort',101,'annual'));assert.throws(()=>calculateEducationPricing('student',2,'monthly'));const q=calculateEducationPricing('education_enterprise',101,'annual');assert.equal(q.periodTotalCents,null);assert.equal(q.discountPercent,null);});
});
