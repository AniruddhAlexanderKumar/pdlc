export interface TraceabilityChainNode {
  questionId: string;
  questionTitle: string;
  requirementIds: string[];
  constraintIds: string[];
  evidenceIds: string[];
  analysisIds: string[];
  decisionIds: string[];
  verificationIds: string[];
  anomalies: Array<{
    type:
      | "QUESTION_NO_REQUIREMENTS"
      | "REQUIREMENT_NO_QUESTIONS"
      | "QUESTION_INSUFFICIENT_EVIDENCE"
      | "EVIDENCE_DOES_NOT_ANSWER"
      | "DECISION_ON_UNAPPROVED_REQUIREMENT"
      | "DECISION_ON_CONTRADICTORY_EVIDENCE"
      | "UNVERIFIED_REQUIREMENT";
    severity: "HIGH" | "MEDIUM" | "LOW";
    description: string;
    targetId: string;
  }>;
}

export function evaluateTraceabilityChainAnomalies(
  node: Partial<TraceabilityChainNode> & { questionTitle: string }
): TraceabilityChainNode["anomalies"] {
  const anomalies: TraceabilityChainNode["anomalies"] = [];

  if (!node.requirementIds || node.requirementIds.length === 0) {
    anomalies.push({
      type: "QUESTION_NO_REQUIREMENTS",
      severity: "HIGH",
      description: "Engineering Question has no linked supporting Requirements.",
      targetId: node.questionId || "Q_DRAFT",
    });
  }

  if (!node.evidenceIds || node.evidenceIds.length === 0) {
    anomalies.push({
      type: "QUESTION_INSUFFICIENT_EVIDENCE",
      severity: "HIGH",
      description: "Engineering Question lacks supporting experimental or analytical Evidence.",
      targetId: node.questionId || "Q_DRAFT",
    });
  }

  return anomalies;
}
