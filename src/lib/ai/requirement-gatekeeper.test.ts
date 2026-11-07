import { describe, expect, it } from "vitest";
import { inspectRequirementQuality } from "./requirement-quality-inspector";
import { inspectAndFormulateQuestion } from "./question-gatekeeper";
import { evaluateTraceabilityChainAnomalies } from "@/domain/traceability-chain";

describe("Requirement Quality & Question Gatekeeper Engines", () => {
  it("detects subjective terms and missing metrics in poor requirements", () => {
    const poorReq = {
      title: "Engine thrust",
      statement: "The engine shall provide adequate thrust and reliable performance.",
      ownerId: null,
      verificationMethod: null,
    };

    const result = inspectRequirementQuality(poorReq);
    expect(result.qualityStatus).toBe("NOT_VERIFIABLE");
    expect(result.flaws.some((f) => f.flawType === "SUBJECTIVE_LANGUAGE")).toBe(true);
    expect(result.flaws.some((f) => f.flawType === "MISSING_MEASURABLE_CRITERIA")).toBe(true);
    expect(result.flaws.some((f) => f.flawType === "MISSING_OWNER")).toBe(true);
    expect(result.proposedImprovement).toBeDefined();
    expect(result.proposedImprovement?.statement).toContain("[insert specific numeric target & tolerance]");
  });

  it("passes high-quality objective aerospace requirements", () => {
    const goodReq = {
      id: "req_001",
      identifier: "REQ-001",
      title: "Vacuum Thrust Output",
      statement: "The upper stage engine shall produce at least 450 kN of thrust in vacuum.",
      rationale: "Required to satisfy 2nd stage orbital insertion trajectory delta-v.",
      ownerId: "usr_123",
      verificationMethod: "TEST",
    };

    const result = inspectRequirementQuality(goodReq);
    expect(result.qualityStatus).toBe("COMPLETE");
    expect(result.flaws).toHaveLength(0);
  });

  /**
   * The same guard `certification.test.ts`, `evidence.test.ts`,
   * `impact-analysis.test.ts` and `baseline-comparison.test.ts` already
   * apply to their own vocabularies, applied here too.
   *
   * This inspector briefly did carry one — `score: number`, computed as
   * `100 - 15 per flaw` — and a test asserted it equalled 100, which locked
   * the violation in rather than catching it. A classification a reader can
   * argue with is worth more than a number nobody can.
   */
  it("reports a classification and real flaws, and no score of any kind", () => {
    const result = inspectRequirementQuality({
      title: "Engine thrust",
      statement: "The engine shall provide adequate thrust.",
      ownerId: null,
      verificationMethod: null,
    });

    expect(result).not.toHaveProperty("score");
    const serialised = JSON.stringify(result).toLowerCase();
    for (const forbidden of ["score", "percent", "rating", "confidence"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("converts vague input questions into formal engineering questions", () => {
    const userInput = "How do we make this engine better?";
    const result = inspectAndFormulateQuestion(userInput, "Upper Stage Propulsion");

    expect(result.isWellFormed).toBe(false);
    expect(result.flaws.some((f) => f.flawType === "AMBIGUOUS_TERM")).toBe(true);
    expect(result.flaws.some((f) => f.flawType === "MISSING_MEASURABLE_VARIABLES")).toBe(true);
    expect(result.clarificationPrompts.length).toBeGreaterThan(0);
    expect(result.formalQuestionTemplate).toContain("Upper Stage Propulsion");
  });

  it("detects traceability anomalies when questions lack requirements or evidence", () => {
    const anomalies = evaluateTraceabilityChainAnomalies({
      questionId: "Q-101",
      questionTitle: "How to increase specific impulse by 2%?",
      requirementIds: [],
      evidenceIds: [],
    });

    expect(anomalies.some((a) => a.type === "QUESTION_NO_REQUIREMENTS")).toBe(true);
    expect(anomalies.some((a) => a.type === "QUESTION_INSUFFICIENT_EVIDENCE")).toBe(true);
  });
});
