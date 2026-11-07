import {
  type RequirementQualityFlaw,
  type RequirementQualityResult,
  type RequirementQualityStatus,
  SUBJECTIVE_TERMS,
  COMMON_ENGINEERING_UNITS,
} from "@/domain/requirement-quality";

export interface RequirementInputForQualityCheck {
  id?: string;
  identifier?: string;
  title: string;
  statement: string;
  rationale?: string | null;
  source?: string | null;
  ownerId?: string | null;
  stakeholder?: string | null;
  verificationMethod?: string | null;
  dependencies?: string[] | null;
}

export function inspectRequirementQuality(
  req: RequirementInputForQualityCheck
): RequirementQualityResult {
  const flaws: RequirementQualityFlaw[] = [];
  const lowerStatement = req.statement.toLowerCase();

  // 1. Check for subjective terms
  const foundSubjective: string[] = [];
  for (const term of SUBJECTIVE_TERMS) {
    if (new RegExp(`\\b${term}\\b`, "i").test(req.statement)) {
      foundSubjective.push(term);
    }
  }

  if (foundSubjective.length > 0) {
    flaws.push({
      flawType: "SUBJECTIVE_LANGUAGE",
      title: "Subjective or Imprecise Language Detected",
      description: `Statement uses non-verifiable subjective term(s): "${foundSubjective.join(
        '", "'
      )}". Requirements must use objective, quantifiable targets.`,
      flawedSnippet: foundSubjective.join(", "),
    });
  }

  // 2. Check for missing quantitative / measurable criteria
  const hasNumbers = /\d+/.test(req.statement);
  if (!hasNumbers) {
    flaws.push({
      flawType: "MISSING_MEASURABLE_CRITERIA",
      title: "Missing Measurable Numerical Criteria",
      description:
        "The requirement lacks specific numeric bounds, tolerances, or measurable acceptance criteria (e.g. '< 4.5 kg', '>= 98.5% efficiency').",
    });
  }

  // 3. Check for missing explicit units when numbers are present
  if (hasNumbers) {
    const hasUnits = COMMON_ENGINEERING_UNITS.some((unit) =>
      new RegExp(`\\d+\\s*${unit}\\b`, "i").test(req.statement)
    );
    if (!hasUnits) {
      flaws.push({
        flawType: "MISSING_UNITS",
        title: "Missing Explicit Engineering Units",
        description:
          "Numerical targets are stated without explicit engineering units (e.g., kg, N, Pa, m/s, °C, Hz).",
      });
    }
  }

  // 4. Check for compound statements ("shall do X and shall do Y")
  const shallCount = (req.statement.match(/\bshall\b/gi) || []).length;
  if (shallCount > 1 || (lowerStatement.includes(" and ") && lowerStatement.includes("shall"))) {
    flaws.push({
      flawType: "COMPOUND_STATEMENT",
      title: "Multiple Requirements Combined",
      description:
        "Requirement combines multiple distinct obligations into a single statement. Decompose into atomic single-purpose requirements.",
    });
  }

  // 5. Check missing rationale / justification
  if (!req.rationale || req.rationale.trim().length < 10) {
    flaws.push({
      flawType: "MISSING_SOURCE_OR_RATIONALE",
      title: "Missing Engineering Rationale & Justification",
      description:
        "Without explicit rationale, future engineers cannot assess whether design trade-offs or proposed changes invalidate this requirement.",
    });
  }

  // 6. Check missing owner
  if (!req.ownerId) {
    flaws.push({
      flawType: "MISSING_OWNER",
      title: "Unassigned Requirement Owner",
      description: "No engineer owner is assigned to steward and maintain this requirement.",
    });
  }

  // 7. Check missing verification method
  if (!req.verificationMethod) {
    flaws.push({
      flawType: "MISSING_VERIFICATION_METHOD",
      title: "Missing Verification Method",
      description:
        "No explicit verification method (Analysis, Inspection, Test, or Demonstration) is assigned.",
    });
  }

  // Classify Quality Status
  let status: RequirementQualityStatus = "COMPLETE";
  if (flaws.some((f) => f.flawType === "SUBJECTIVE_LANGUAGE" || f.flawType === "NOT_VERIFIABLE")) {
    status = "NOT_VERIFIABLE";
  } else if (flaws.some((f) => f.flawType === "MISSING_MEASURABLE_CRITERIA" || f.flawType === "MISSING_UNITS")) {
    status = "NEEDS_CLARIFICATION";
  } else if (flaws.length > 0) {
    status = "MISSING_INFORMATION";
  }

  // Generate proposed non-destructive improvement
  let proposedStatement = req.statement;
  if (foundSubjective.length > 0) {
    proposedStatement = req.statement.replace(
      /adequate|sufficient|fast|reliable|as needed|appropriate|flexible|robust/gi,
      "[insert specific numeric target & tolerance]"
    );
  }

  const proposedImprovement =
    flaws.length > 0
      ? {
          title: req.title,
          statement: proposedStatement,
          rationale: req.rationale || "Derived from system-level performance requirements.",
          suggestedVerificationMethod: req.verificationMethod || "TEST",
        }
      : undefined;

  return {
    requirementId: req.id || "DRAFT",
    qualityStatus: status,
    flaws,
    proposedImprovement,
  };
}
