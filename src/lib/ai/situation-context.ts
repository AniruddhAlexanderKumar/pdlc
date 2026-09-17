/**
 * Situation-Aware Context Engine for PDLC Platform.
 * Senses active route, engineering domain module, user role, and workspace situation.
 */

export interface SituationalContext {
  pathname: string;
  moduleName: string;
  moduleCategory: "Understand" | "Define" | "Decide" | "Prove" | "Change" | "Certify" | "System";
  primaryDomainEntity: string;
  userRole: string;
  projectId?: string;
  itemIdentifier?: string;
  summary: string;
  suggestedPrompts: string[];
}

export function extractSituationContext(
  pathname: string,
  userRole: string = "ENGINEER"
): SituationalContext {
  const cleanPath = pathname.split("?")[0] ?? "";
  const segments = cleanPath.split("/").filter(Boolean);

  let projectId: string | undefined;
  if (segments[0] === "projects" && segments[1]) {
    projectId = segments[1];
  }

  // Matching route segments to engineering domains
  if (cleanPath.includes("/requirements") || cleanPath.includes("/needs")) {
    return {
      pathname: cleanPath,
      moduleName: "Requirements & Stakeholder Needs",
      moduleCategory: "Define",
      primaryDomainEntity: "Requirement",
      userRole,
      projectId,
      summary: "Defining specifications and linking originating stakeholder needs to design requirements.",
      suggestedPrompts: [
        "Analyze requirements completeness on this page",
        "Check missing verification links",
        "How do I trace REQ-001 back to Stakeholder Needs?",
      ],
    };
  }

  if (cleanPath.includes("/decisions") || cleanPath.includes("/design") || cleanPath.includes("/interfaces")) {
    return {
      pathname: cleanPath,
      moduleName: "Engineering Decisions & Architecture",
      moduleCategory: "Decide",
      primaryDomainEntity: "EngineeringDecision",
      userRole,
      projectId,
      summary: "Recording trade-offs, decision rationale, alternatives, and explicit assumptions.",
      suggestedPrompts: [
        "What assumptions are registered for this decision?",
        "Explain Decision Sentinel surveillance rules",
        "How do I link a decision to a design item?",
      ],
    };
  }

  if (cleanPath.includes("/verification") || cleanPath.includes("/evidence") || cleanPath.includes("/readiness")) {
    return {
      pathname: cleanPath,
      moduleName: "Verification & Evidence",
      moduleCategory: "Prove",
      primaryDomainEntity: "VerificationActivity",
      userRole,
      projectId,
      summary: "Planning and validating Analysis, Inspection, Test, and Demonstration activities.",
      suggestedPrompts: [
        "Summarize verification readiness criteria",
        "How to attach evidence to a test procedure?",
        "Check passed vs failed verification status",
      ],
    };
  }

  if (cleanPath.includes("/changes") || cleanPath.includes("/baselines") || cleanPath.includes("/drift")) {
    return {
      pathname: cleanPath,
      moduleName: "Change Control & Baselines",
      moduleCategory: "Change",
      primaryDomainEntity: "ChangeRequest",
      userRole,
      projectId,
      summary: "Evaluating graph impact for proposed change requests and detecting operational drift.",
      suggestedPrompts: [
        "How does multi-hop graph impact analysis work?",
        "Explain baseline drift assessment",
        "Can a change request alter baselined requirements?",
      ],
    };
  }

  if (cleanPath.includes("/sentinel")) {
    return {
      pathname: cleanPath,
      moduleName: "Decision Sentinel",
      moduleCategory: "Understand",
      primaryDomainEntity: "SentinelEvent",
      userRole,
      projectId,
      summary: "Active surveillance monitoring assumption invalidations and upstream graph changes.",
      suggestedPrompts: [
        "Why is there an open surveillance target?",
        "Difference between Acknowledge and Resolve in Sentinel?",
        "How Sentinel monitors decision expectations",
      ],
    };
  }

  if (cleanPath.includes("/certification")) {
    return {
      pathname: cleanPath,
      moduleName: "Certification & Compliance",
      moduleCategory: "Certify",
      primaryDomainEntity: "CertificationProgram",
      userRole,
      projectId,
      summary: "Managing certification programs, regulatory compliance items, and authority findings.",
      suggestedPrompts: [
        "How to map compliance items to requirements?",
        "What constitutes a certification finding resolution?",
        "Overview of certification readiness review",
      ],
    };
  }

  if (cleanPath.includes("/dashboard") || cleanPath.includes("/command-center")) {
    return {
      pathname: cleanPath,
      moduleName: "Command Center Dashboard",
      moduleCategory: "Understand",
      primaryDomainEntity: "Project",
      userRole,
      projectId,
      summary: "High-level orientation of project health, open change requests, and Sentinel alerts.",
      suggestedPrompts: [
        "Summarize project status & open items",
        "What requires my immediate attention?",
        "How to customize my Command Center layout?",
      ],
    };
  }

  // Fallback / General Workspace
  return {
    pathname: cleanPath,
    moduleName: "PDLC Workspace Shell",
    moduleCategory: "System",
    primaryDomainEntity: "Workspace",
    userRole,
    projectId,
    summary: "Aerospace Product Development Life Cycle Platform general workspace.",
    suggestedPrompts: [
      "What can I do in this workspace?",
      "How to create my first requirement and trace it?",
      "Explain the zero fake metrics philosophy",
    ],
  };
}

export interface SituationalResponse {
  answer: string;
  contextBanner: string;
  recommendedActions: string[];
}

export function generateSituationalAnalysis(
  context: SituationalContext,
  userMessage?: string
): SituationalResponse {
  const query = userMessage?.toLowerCase().trim() ?? "";

  // If user asks for general page analysis
  if (!query || query.includes("analyze") || query.includes("summary") || query.includes("overview")) {
    return {
      contextBanner: `📍 Aware of: ${context.moduleName} (${context.moduleCategory}) | Role: ${context.userRole}`,
      answer: `You are currently in **${context.moduleName}** (${context.moduleCategory} Phase).\n\n` +
        `**Key Focus:** ${context.summary}\n\n` +
        `**Situation Insights:**\n` +
        `- Primary Entity: \`${context.primaryDomainEntity}\`\n` +
        `- User Authority: Holding \`${context.userRole}\` access role.\n` +
        `- Graph Connection: Every object created here links explicitly to upstream/downstream nodes. There are no arbitrary severity scores or hidden magic numbers.`,
      recommendedActions: context.suggestedPrompts,
    };
  }

  // Sentinel query
  if (query.includes("sentinel") || query.includes("surveillance") || query.includes("assumption")) {
    return {
      contextBanner: `📍 Aware of: Decision Sentinel | Entity: SentinelEvent`,
      answer: `**Decision Sentinel** operates on explicit decision memory:\n\n` +
        `1. **Surveillance Target Triggering**: When an engineering artifact changes (e.g. requirement modified), Sentinel checks if any active Decision explicitly registered an assumption on it.\n` +
        `2. **Acknowledged vs Resolved**: Acknowledging records that an engineer reviewed the signal. Resolving requires a real audit note documenting why the decision remains valid or how it was updated.\n` +
        `3. **Zero False Positives**: Unrelated changes never trigger surveillance targets.`,
      recommendedActions: [
        "Go to Decision Sentinel page",
        "View decision assumptions guide",
        "Explain multi-hop trace impact",
      ],
    };
  }

  // Traceability & Gap query
  if (query.includes("trace") || query.includes("gap") || query.includes("link") || query.includes("requirement")) {
    return {
      contextBanner: `📍 Aware of: Traceability Matrix & Requirements`,
      answer: `**Traceability Rules in PDLC:**\n\n` +
        `- **Upstream**: Requirement → Stakeholder Need (\`NeedRequirementLink\`)\n` +
        `- **Downstream**: Requirement → Design Item (\`RequirementDesignLink\`) and Verification Activity (\`RequirementVerificationLink\`)\n` +
        `- **Verification Gap**: A requirement without a linked passed verification activity cannot reach \`APPROVED\` or \`BASELINED\` status safely.\n` +
        `- Use the **Trace** button on any detail page to inspect its full graph context.`,
      recommendedActions: [
        "Open Traceability Matrix",
        "Check unverified requirements",
        "View lifecycle status transitions",
      ],
    };
  }

  // Default intelligent response based on current context
  return {
    contextBanner: `📍 Aware of: ${context.moduleName} | Query: "${userMessage}"`,
    answer: `Regarding **${userMessage}** in the context of **${context.moduleName}**:\n\n` +
      `In PDLC Platform, all actions in this module adhere strictly to the engineering record. ` +
      `As a **${context.userRole}**, your actions update the graph deterministically and are logged to the immutable audit trail.\n\n` +
      `Need more specific details? You can ask about graph traversal rules, decision Sentinel triggers, or verification evidence requirements.`,
    recommendedActions: context.suggestedPrompts,
  };
}
