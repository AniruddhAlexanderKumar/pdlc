import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePricing,
  BILLING_PERIODS,
  recommendedPlan,
} from "./pricing.js";
describe("pricing", () => {
  it("prices the stated examples in integer cents", () => {
    for (const [plan, editors, expected] of [
      ["small", 10, [4000, 11400, 21600, 38400]],
      ["medium", 100, [24000, 68400, 129600, 230400]],
    ] as const)
      BILLING_PERIODS.forEach((b, i) =>
        assert.equal(
          calculatePricing(plan, editors, b).periodTotalCents,
          expected[i],
        ),
      );
  });
  it("validates plan boundaries and recommends matching plans", () => {
    for (const [n, p] of [
      [1, "individual"],
      [2, "small"],
      [49, "small"],
      [50, "medium"],
      [199, "medium"],
      [200, "enterprise"],
    ] as const) {
      assert.equal(recommendedPlan(n), p);
      for (const b of BILLING_PERIODS)
        assert.equal(calculatePricing(p, n, b).editors, n);
    }
    assert.throws(() => calculatePricing("small", 50, "monthly"));
    assert.throws(() => calculatePricing("medium", 49, "annual"));
    assert.throws(() => calculatePricing("individual", 2, "monthly"));
  });
  it("rounds the final period total to cents and keeps enterprise custom", () => {
    const q = calculatePricing("small", 3, "quarterly");
    assert.equal(q.originalPeriodCents, 6750);
    assert.equal(q.periodTotalCents, 6413);
    assert.equal(q.discountCents, 337);
    assert.equal(
      calculatePricing("enterprise", 20, "annual").periodTotalCents,
      null,
    );
    assert.equal(calculatePricing("enterprise", 20, "annual").discountPercent, null);
  });
});
