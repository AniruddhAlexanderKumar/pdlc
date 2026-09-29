export interface GuideStep {
  stepNumber: number;
  title: string;
  action: string;
  uiTarget: string;
  description: string;
  tip?: string;
  warning?: string;
}

export interface SimpleWorkflowSummary {
  whatItDoes: string;
  whereToClick: string;
  whatYouGet: string;
}

export interface GuideCategory {
  id: string;
  title: string;
  iconName: string;
  badge: string;
  shortDescription: string;
  targetRoute: string;
  routeLabel: string;
  simpleSummary: SimpleWorkflowSummary;
  steps: GuideStep[];
  practiceScenario?: {
    headline: string;
    sampleInput: string;
    expectedOutcome: string;
    interactiveType: "quality" | "conflict" | "question" | "impact" | "verification";
  };
}

export const GUIDE_CATEGORIES: ReadonlyArray<GuideCategory> = [
  {
    id: "setup",
    title: "Workspace & Team Setup",
    iconName: "Users",
    badge: "Getting Started",
    shortDescription: "Configure your organization, create project workspaces, set custom terminology, and invite team members with specific roles.",
    targetRoute: "/organization",
    routeLabel: "Go to Organization",
    simpleSummary: {
      whatItDoes: "Sets up your company workspace and invites your engineering team members.",
      whereToClick: "Top Bar -> Click Organization Name -> People -> Add a Person",
      whatYouGet: "Secure role-based access for engineers, managers, and reviewers across your projects.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Access Organization Settings",
        action: "Click your organization name in the top navigation bar",
        uiTarget: "Top bar -> Organization Name",
        description: "Open the Organization portal to manage team membership, seats, and workspace settings.",
        tip: "Only organization owners can invite new members or change team roles.",
      },
      {
        stepNumber: 2,
        title: "Add Organization Members",
        action: "Navigate to the People tab and click 'Add a person'",
        uiTarget: "Organization -> People -> Add a person",
        description: "Enter full name, corporate email address, and initial login credentials. Members gain immediate account access.",
      },
      {
        stepNumber: 3,
        title: "Create a Project Workspace",
        action: "Click 'Projects' in the top bar or sidebar, then select 'New Project'",
        uiTarget: "Projects -> New Project",
        description: "Specify project name, domain code (e.g. PROPULSION-2026), target system specifications, and initial security tier.",
      },
      {
        stepNumber: 4,
        title: "Assign Project Roles & Access Control",
        action: "Open Project Overview -> Members -> Add Member",
        uiTarget: "Project -> Members -> Add Member",
        description: "Assign explicit project roles: OWNER, MANAGER, ENGINEER, REVIEWER, or VIEWER. Access control is strictly scoped per project.",
        warning: "Being an organization member does not automatically grant project workspace access.",
      },
    ],
  },
  {
    id: "requirements",
    title: "Requirements & Quality Control",
    iconName: "FileCheck",
    badge: "Quality Gate 1",
    shortDescription: "Author precise requirements, run real-time AI quality inspection against 12 engineering criteria, and fix subjective language.",
    targetRoute: "/projects",
    routeLabel: "Go to Requirements",
    simpleSummary: {
      whatItDoes: "Helps you write clear requirements and automatically catches vague or missing specifications.",
      whereToClick: "Project Sidebar -> Requirements -> New Requirement / Inspect Quality",
      whatYouGet: "Flawless, measurable requirements with clear units and verification methods.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Requirements Module",
        action: "Select a project workspace and click 'Requirements' in the sidebar",
        uiTarget: "Project Sidebar -> Define -> Requirements",
        description: "Access your baseline requirements registry, quality health breakdown, and revision history.",
      },
      {
        stepNumber: 2,
        title: "Author or Import Requirements",
        action: "Click 'New Requirement' or launch the 'Requirements Starter Wizard'",
        uiTarget: "Requirements -> New Requirement / Starter Wizard",
        description: "Provide requirement statement, engineering rationale, category (Functional, Performance, Interface, Safety), and target values.",
        tip: "Always include rationale—it provides the context used in future impact analyses and decision audits.",
      },
      {
        stepNumber: 3,
        title: "Run Quality & Ambiguity Inspector",
        action: "Click 'Inspect Quality' on any requirement draft",
        uiTarget: "Requirement Card -> Inspect Quality",
        description: "The AI engine checks 12 strict criteria: ambiguity, missing measurable metrics, missing units, undefined terms, subjective words ('adequate', 'fast'), and combined statements.",
        warning: "Never use vague words like 'sufficient' or 'as needed'. All requirements must specify exact measurable tolerances (e.g., ±0.05 bar).",
      },
      {
        stepNumber: 4,
        title: "Apply Non-Destructive Improvements",
        action: "Review suggested clear rewrites and click 'Apply Suggested Statement'",
        uiTarget: "Quality Inspector Modal -> Apply Improvement",
        description: "Accept structured rewrites that add units, verification methods, and precise bounds while preserving the original version history.",
      },
    ],
    practiceScenario: {
      headline: "Practice Requirements Quality Inspection",
      sampleInput: "The propulsion valve shall open fast enough to maintain adequate fuel pressure during engine startup.",
      expectedOutcome: "Flagged 3 flaws: Subjective terms ('fast enough', 'adequate'), missing response time (ms), missing pressure unit (bar/kPa).",
      interactiveType: "quality",
    },
  },
  {
    id: "stakeholders",
    title: "Stakeholder Agreement & Conflict Layer",
    iconName: "Handshake",
    badge: "Consensus",
    shortDescription: "Log multi-stakeholder positions, surface subtle interpretation conflicts, and lock binding agreement records.",
    targetRoute: "/projects",
    routeLabel: "Manage Stakeholder Approvals",
    simpleSummary: {
      whatItDoes: "Prevents team misunderstandings by recording approvals and flagging conflicting interpretations.",
      whereToClick: "Requirement Detail -> Approvals & Conflicts -> Record Position",
      whatYouGet: "Clear stakeholder consensus and formal conflict resolution records before work starts.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Requirement Approvals Panel",
        action: "Select a requirement and open the 'Stakeholder Approvals & Conflicts' tab",
        uiTarget: "Requirement Detail -> Approvals & Conflicts",
        description: "View approval status across disciplines (Systems, Propulsion, Thermal, Structures, Safety).",
      },
      {
        stepNumber: 2,
        title: "Record Stakeholder Positions",
        action: "Click 'Record Position', select stakeholder role, position (APPROVED / CONDITIONAL / REJECTED), and notes",
        uiTarget: "Approvals Panel -> Record Position",
        description: "Each discipline logs its formal stance and specific technical interpretation of the requirement.",
      },
      {
        stepNumber: 3,
        title: "Detect Interpretation Conflicts",
        action: "Click 'Detect Conflicts' to analyze cross-discipline notes",
        uiTarget: "Approvals Panel -> Detect Conflicts",
        description: "The engine compares notes (e.g., Thermal assumes 800°C limit while Propulsion assumes 950°C) and surfaces hidden discrepancies.",
        warning: "Unresolved interpretation conflicts are a primary cause of costly late-stage flight failures.",
      },
      {
        stepNumber: 4,
        title: "Generate Requirements Conflict Record",
        action: "Select conflicting positions and click 'Create Resolution Record'",
        uiTarget: "Conflict List -> Create Resolution Record",
        description: "Generate a binding conflict resolution document with agreed engineering compromises and sign-offs.",
      },
    ],
    practiceScenario: {
      headline: "Practice Conflict Resolution",
      sampleInput: "Thermal Team interprets 'max temp' as 650°C continuous; Structures Team interprets as 800°C transient peak.",
      expectedOutcome: "Conflict detected! Generated Conflict Record SCN-CONF-042 requiring joint sign-off before baseline lock.",
      interactiveType: "conflict",
    },
  },
  {
    id: "questions",
    title: "Engineering Question Gatekeeper",
    iconName: "HelpCircle",
    badge: "Problem Framing",
    shortDescription: "Intercept broad, ill-framed engineering questions and transform them into structured queries with clear acceptance criteria.",
    targetRoute: "/projects",
    routeLabel: "Ask Engineering Question",
    simpleSummary: {
      whatItDoes: "Turns vague questions like 'how to make it better?' into sharp, solvable engineering questions.",
      whereToClick: "Top Bar or Decisions Module -> Ask Engineering Question",
      whatYouGet: "Framed trade studies with exact variables, constraints, and success criteria.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Launch Engineering Question Gatekeeper",
        action: "Click 'Ask Question' in the top bar or inside the Decision/Analysis module",
        uiTarget: "Top Bar / Decisions -> Ask Question",
        description: "Enter your raw engineering question or design uncertainty.",
      },
      {
        stepNumber: 2,
        title: "Automatic Framing Flaw Interception",
        action: "Submit query to trigger automated framing inspection",
        uiTarget: "Question Modal -> Analyze Query",
        description: "The gatekeeper flags broad queries (e.g. 'How to make engine better?') and identifies missing operating envelopes, missing baseline parameters, or multi-part confusion.",
        warning: "Broad questions lead to wasted analysis hours and non-comparable trade studies.",
      },
      {
        stepNumber: 3,
        title: "Select Structured Question Template",
        action: "Review recommended structured reformulations",
        uiTarget: "Question Gatekeeper -> Select Refined Question",
        description: "Choose a precise formulation specifying sub-system scope, independent variables, constraints, and success metrics.",
      },
      {
        stepNumber: 4,
        title: "Publish Formal Engineering Question",
        action: "Click 'Publish Formal Question'",
        uiTarget: "Gatekeeper -> Publish",
        description: "Creates an official Engineering Question linked to candidate trade decisions and verification activities.",
      },
    ],
    practiceScenario: {
      headline: "Practice Question Refinement",
      sampleInput: "How can we make the turbopump more reliable?",
      expectedOutcome: "Refined to: 'What design modification increases turbopump bearing mean-time-between-failures to >=5,000s under 45,000 RPM cryogenic LOX flow?'",
      interactiveType: "question",
    },
  },
  {
    id: "traceability",
    title: "Traceability Chain & Graph Exploration",
    iconName: "GitFork",
    badge: "Knowledge Graph",
    shortDescription: "Explore multi-hop relationships across requirements, decisions, components, verification plans, risks, and evidence.",
    targetRoute: "/projects",
    routeLabel: "View Traceability Matrix",
    simpleSummary: {
      whatItDoes: "Shows how everything in your project connects—from top goals down to parts and test results.",
      whereToClick: "Project Sidebar -> Understand -> Traceability Matrix",
      whatYouGet: "Complete visual map of dependencies and evidence for compliance audits.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Traceability Matrix",
        action: "Click 'Traceability' in project sidebar under 'Understand'",
        uiTarget: "Project Sidebar -> Understand -> Traceability",
        description: "Load the complete dependency graph spanning all 14 engineering artifact types.",
      },
      {
        stepNumber: 2,
        title: "Select Seed Artifact for Traversal",
        action: "Click on any requirement, decision, component, or test plan",
        uiTarget: "Traceability Matrix -> Select Node",
        description: "Set the root node for forward (downstream consequences) or backward (upstream rationale) graph traversal.",
      },
      {
        stepNumber: 3,
        title: "Set Traversal Depth and Filters",
        action: "Choose hop depth (1 to 4 hops) and select edge relationship types",
        uiTarget: "Traceability Controls -> Depth & Edge Filters",
        description: "Filter by specific edge relationships: SATISFIES, DERIVED_FROM, VERIFIED_BY, MITIGATES, DEPENDS_ON.",
        tip: "Use the 'Trace' button on any individual record page for 1-click focused graph inspection.",
      },
      {
        stepNumber: 4,
        title: "Export & Audit Trace Coverage",
        action: "Click 'Export Traceability Report' or check unlinked items",
        uiTarget: "Traceability Header -> Export Report",
        description: "Generate compliant audit reports showing end-to-end traceability from top-level mission goals down to test evidence.",
      },
    ],
  },
  {
    id: "simulator",
    title: "Requirement Change Impact Simulator",
    iconName: "Zap",
    badge: "Core Feature",
    shortDescription: "Propose requirement modifications and simulate 1st, 2nd, and 3rd order downstream impacts across the entire knowledge graph.",
    targetRoute: "/projects",
    routeLabel: "Run Impact Simulator",
    simpleSummary: {
      whatItDoes: "Simulates what will break or need re-testing before you change a requirement.",
      whereToClick: "Requirement Action -> Simulate Change Impact -> Run Graph Impact Analysis",
      whatYouGet: "A downstream blast radius map and automatic revalidation checklist.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Impact Simulator",
        action: "Navigate to Requirements -> select requirement -> click 'Simulate Change Impact'",
        uiTarget: "Requirement Action -> Simulate Change Impact",
        description: "Launch the dedicated blast radius calculator for proposed additions, modifications, or deletions.",
      },
      {
        stepNumber: 2,
        title: "Define Proposed Change",
        action: "Enter proposed new value/statement and rationale for change",
        uiTarget: "Impact Simulator -> Enter Proposed Change",
        description: "Compare baseline vs proposed revision in side-by-side diff mode (e.g. increase chamber pressure from 100 bar to 120 bar).",
      },
      {
        stepNumber: 3,
        title: "Calculate Downstream Blast Radius",
        action: "Click 'Run Graph Impact Analysis'",
        uiTarget: "Impact Simulator -> Run Analysis",
        description: "Traverses all connected artifacts and classifies impact severity: DIRECT, DOWNSTREAM, CROSS_DOMAIN, and CONTEXT.",
      },
      {
        stepNumber: 4,
        title: "Inspect Blast Radius Graph & Invalidation Flags",
        action: "Explore SVG graph nodes and view 'APPROVAL_POTENTIALLY_INVALIDATED' list",
        uiTarget: "Impact Simulator -> Blast Radius Graph",
        description: "All downstream approved decisions, components, and verification plans are automatically flagged for revalidation.",
        warning: "Changes never auto-approve downstream items—every affected item requires human engineer re-verification.",
      },
      {
        stepNumber: 5,
        title: "Generate What Must Be Revalidated Checklist",
        action: "Click 'Create Revalidation Plan'",
        uiTarget: "Revalidation Panel -> Export Checklist",
        description: "Produces an actionable checklist of tests to re-run, drawings to update, and stakeholder approvals to re-acquire.",
      },
    ],
    practiceScenario: {
      headline: "Practice Impact Blast Radius Simulation",
      sampleInput: "Change REQ-PROP-001 (Chamber Pressure) from 100 bar to 125 bar.",
      expectedOutcome: "12 affected items: 3 downstream requirements, 2 design decisions, 4 test plans, 3 component specs flagged as APPROVAL_POTENTIALLY_INVALIDATED.",
      interactiveType: "impact",
    },
  },
  {
    id: "verification",
    title: "Verification & Evidence Linking",
    iconName: "ShieldCheck",
    badge: "Qualification",
    shortDescription: "Define verification methods (Test, Analysis, Inspection, Demonstration) and attach verifiable documentary evidence.",
    targetRoute: "/projects",
    routeLabel: "View Verification Plans",
    simpleSummary: {
      whatItDoes: "Records test plans and attaches real proof documents showing requirements are met.",
      whereToClick: "Project Sidebar -> Prove -> Verification -> Assign Method / Attach Evidence",
      whatYouGet: "Verifiable proof that your product passes all engineering tests.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Verification Module",
        action: "Click 'Verification' under 'Prove' in project sidebar",
        uiTarget: "Project Sidebar -> Prove -> Verification",
        description: "Track requirement verification status across Test, Analysis, Inspection, and Demonstration.",
      },
      {
        stepNumber: 2,
        title: "Assign Verification Method",
        action: "Select requirement -> click 'Assign Method' (TEST / ANALYSIS / INSPECTION / DEMO)",
        uiTarget: "Verification Plan -> Assign Method",
        description: "Specify success criteria, required test facilities, environment conditions, and pass/fail thresholds.",
      },
      {
        stepNumber: 3,
        title: "Attach Evidence Record",
        action: "Click 'Attach Evidence' -> select or create Evidence Document reference",
        uiTarget: "Verification Plan -> Attach Evidence",
        description: "Link real test reports, telemetry logs, FEA simulation outputs, or inspection certificates.",
        warning: "Evidence is referenced, not stored as binary blobs. Store document URI, checksum, and author metadata.",
      },
      {
        stepNumber: 4,
        title: "Execute Sign-Off & Close Verification Gap",
        action: "Review attached evidence and click 'Submit Verification Sign-Off'",
        uiTarget: "Verification Detail -> Sign-Off",
        description: "Changes requirement verification status to VERIFIED once approved by assigned lead engineer.",
      },
    ],
  },
  {
    id: "sentinel",
    title: "Decision Sentinel",
    iconName: "Activity",
    badge: "Surveillance",
    shortDescription: "See which analyses an engineering change has called into question, and close each one deliberately.",
    targetRoute: "/projects",
    routeLabel: "Open Sentinel",
    simpleSummary: {
      whatItDoes:
        "Opens a surveillance target when a change touches something an existing analysis actually depends on.",
      whereToClick: "Project sidebar -> Sentinel",
      whatYouGet: "A list of analyses worth re-checking, each naming the change that prompted it.",
    },
    steps: [
      {
        stepNumber: 1,
        title: "Open Sentinel for the project",
        action: "Click 'Sentinel' in the project sidebar",
        uiTarget: "Project sidebar -> Sentinel",
        description:
          "Lists every open surveillance target. A target exists only where the downstream engine's own recorded basis references the object that changed — Sentinel does not guess at relevance.",
      },
      {
        stepNumber: 2,
        title: "Read why a target opened",
        action: "Open a target to see the change that triggered it and the analysis it affects",
        uiTarget: "Sentinel -> a surveillance target",
        description:
          "Each target names the source change, the dependent analysis, and the dependency between them. There is no severity number: what you get is the actual relationship, so you can judge it.",
      },
      {
        stepNumber: 3,
        title: "Acknowledge, then resolve",
        action: "Acknowledge to record that it has been looked at; resolve once the analysis is re-run or confirmed still valid",
        uiTarget: "Sentinel target -> Acknowledge / Resolve",
        description:
          "Acknowledging and resolving are separate on purpose: the first says a person has seen it, the second says the engineering question behind it is settled. Both are audited.",
      },
      {
        stepNumber: 4,
        title: "Re-evaluate when the underlying work changes",
        action: "Use 'Re-evaluate' to re-run the dependent engine against current state",
        uiTarget: "Sentinel target -> Re-evaluate",
        description:
          "Re-evaluation appends a fresh assessment rather than editing the old one, so the record of what was believed, and when, survives.",
      },
    ],
  },
] as const;

/**
 * The guide category most relevant to a route, or `null` when nothing in
 * particular is.
 *
 * This mapping used to live inside a floating overlay pinned to every page,
 * which is the only reason that overlay existed — it opened the guide
 * already filtered to the section matching wherever the reader was. The
 * overlay is gone; the behaviour it was there for is not, and now it sits
 * beside the categories it names, where a missing id is visible and
 * testable rather than a silently dead string in a component.
 *
 * Deliberately returns `null` rather than guessing a default: opening the
 * guide on an unrelated section is worse than opening it on its own index.
 */
export function guideCategoryForRoute(pathname: string): string | null {
  const route = pathname.split("?")[0] ?? "";
  if (route.includes("/requirements")) return "requirements";
  if (route.includes("/stakeholder-needs")) return "stakeholders";
  if (route.includes("/changes")) return "simulator";
  if (route.includes("/traceability")) return "traceability";
  if (route.includes("/verification")) return "verification";
  if (route.includes("/sentinel")) return "sentinel";
  return null;
}
