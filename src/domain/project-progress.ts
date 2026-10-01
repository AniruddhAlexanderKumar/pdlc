/**
 * "Where is this project, and what do I do next?" — answered from real rows.
 *
 * The product holds about twenty kinds of engineering record. A newcomer
 * should not have to learn them to know what to do, so they are grouped
 * here into the six things a team is actually doing:
 *
 *   Define  → What are we trying to build?
 *   Design  → What are we creating?
 *   Decide  → Why did we choose this approach?
 *   Verify  → How do we know it works?
 *   Control → What changed, and what does it affect?
 *   Release → Is the engineering work complete enough?
 *
 * Each stage has one of four states, and every state follows from the
 * records by a rule written down in this file:
 *
 *   NOT_STARTED   nothing recorded for this stage yet
 *   IN_PROGRESS   work exists that its author has not finished
 *   NEEDS_REVIEW  something is waiting on a person to look at it
 *   READY         everything recorded for this stage is complete
 *
 * Two rules the whole product lives by apply with particular force here,
 * because a "progress" view is exactly where they are easiest to break:
 *
 * - **Absence is never readiness.** A project with no risks recorded is
 *   NOT_STARTED on Control, not READY — nobody has looked, which is not the
 *   same as there being nothing to find. A release gate nobody has run is
 *   not READY. A release check that has gone stale since it was run is not
 *   READY either, however it read at the time.
 * - **No aggregate.** There is no "4 of 6" and no progress bar. A ratio of
 *   stages treats "no requirements yet" and "one check missing proof" as
 *   equal sixths of some whole. Each stage reports its own facts.
 *
 * "Learn" (lessons learned) is part of the brief's model and is absent here
 * on purpose: the product has no lessons capability yet, and a stage that
 * can never move would be a promise the software cannot keep.
 *
 * Pure: no framework or database imports. The facts are gathered by
 * `project-progress.repository.ts` and the release gate's freshness comes
 * from the technical-readiness engine that already owns it.
 */

export const PROGRESS_STATES = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "READY"] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

export const PROGRESS_STAGES = ["DEFINE", "DESIGN", "DECIDE", "VERIFY", "CONTROL", "RELEASE"] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

/**
 * The module each stage's work lives in — the path suffix under
 * `/projects/:id`. Exported so the project navigation's tests can check
 * every stage destination is a page the navigation actually offers, by
 * construction rather than by someone remembering to update two lists.
 */
export const PROGRESS_MODULES = [
  "requirements",
  "design-items",
  "decisions",
  "verification",
  "evidence",
  "changes",
  "risks",
  "issues",
  "baselines",
] as const;
export type ProgressModule = (typeof PROGRESS_MODULES)[number];

/** Where a step's button goes: a module, or the release check on the project page. */
export type ProgressDestination = ProgressModule | "release-check";

/**
 * The release check has no page of its own — it is the readiness panel on
 * the project's page — so it is reached by anchor, with the release gate
 * preselected rather than left for the reader to find in a list of five.
 *
 * `opensForm` is for a step whose action is to create something ("Write
 * the first requirement"): the link opens that page with its "New …" form
 * already open (`?new=1`, read by `useCreateDialogState`), so the button
 * does what it says instead of leaving the reader to find a second one.
 */
export function progressDestinationHref(
  projectId: string,
  destination: ProgressDestination,
  opensForm = false,
): string {
  if (destination === "release-check") return `/projects/${projectId}?gate=RELEASE_READY#release-check`;
  return `/projects/${projectId}/${destination}${opensForm ? "?new=1" : ""}`;
}

/** What a stage is for, independent of any one project. */
export interface ProgressStageDefinition {
  stage: ProgressStage;
  title: string;
  /** The question the stage answers, in the reader's words. */
  question: string;
  /** What to do in this stage, for someone who has never used a tool like this. */
  explanation: string;
}

export const PROGRESS_STAGE_DEFINITIONS: readonly ProgressStageDefinition[] = [
  {
    stage: "DEFINE",
    title: "Define",
    question: "What are we trying to build?",
    explanation:
      "Write down what the product must do — each thing as its own short statement, specific enough that someone could check it.",
  },
  {
    stage: "DESIGN",
    title: "Design",
    question: "What are we creating?",
    explanation:
      "Describe the parts of the product — systems, assemblies, components — so every requirement has something that will meet it.",
  },
  {
    stage: "DECIDE",
    title: "Decide",
    question: "Why did we choose this approach?",
    explanation:
      "Record each important engineering choice: what you chose, what else you considered, and why — so the next person understands it.",
  },
  {
    stage: "VERIFY",
    title: "Verify",
    question: "How do we know it works?",
    explanation:
      "For every requirement, plan how you'll prove it — a test, an analysis, an inspection or a demonstration — then attach the results.",
  },
  {
    stage: "CONTROL",
    title: "Control change",
    question: "What changed, and what does it affect?",
    explanation:
      "Record a change before making it, so you can see what it affects. Keep track of risks and problems until each one is dealt with.",
  },
  {
    stage: "RELEASE",
    title: "Review & release",
    question: "Is the engineering work complete enough?",
    explanation:
      "Lock the current version of the design, then run the release check. It lists exactly what still stands in the way.",
  },
];

/** The release gate, as the technical-readiness engine reports it. */
export type ReleaseGateFact =
  | { assessed: false }
  | {
      assessed: true;
      status: "READY" | "NOT_READY" | "UNKNOWN";
      /** False when the project has changed since the check was run. */
      current: boolean;
      evaluatedAt: string;
      /** Findings that stand in the way — not-ready and unknown ones. */
      openFindings: number;
    };

/**
 * Everything the stages are computed from. Every number is a count of real
 * rows; retired records (rejected, obsolete, superseded) are excluded
 * throughout, since nobody needs to act on them.
 */
export interface ProjectProgressFacts {
  stakeholderNeeds: { total: number; draft: number };
  requirements: { total: number; draft: number; inReview: number; withoutCheck: number };
  designItems: { total: number; draft: number; inReview: number };
  decisions: { total: number; proposed: number; underReview: number };
  checks: {
    total: number;
    /** Planned or under way — not yet carried out. */
    notRun: number;
    failed: number;
    /** Passed, but with no evidence attached to show it. */
    passedWithoutProof: number;
  };
  control: {
    /** Drafted but not yet submitted. */
    draftChanges: number;
    /** Submitted or under review — waiting on a reviewer. */
    changesAwaitingReview: number;
    /** No handling decided yet (status OPEN). Mitigated or accepted risks are dealt with. */
    openRisks: number;
    openIssues: number;
    /** Every risk, issue and change ever recorded, open or not. */
    everRecorded: number;
  };
  release: {
    activeBaseline: boolean;
    draftBaseline: boolean;
    gate: ReleaseGateFact;
  };
}

/** A project with nothing in it — for tests, and for describing the stages in the abstract. */
export function emptyProgressFacts(): ProjectProgressFacts {
  return {
    stakeholderNeeds: { total: 0, draft: 0 },
    requirements: { total: 0, draft: 0, inReview: 0, withoutCheck: 0 },
    designItems: { total: 0, draft: 0, inReview: 0 },
    decisions: { total: 0, proposed: 0, underReview: 0 },
    checks: { total: 0, notRun: 0, failed: 0, passedWithoutProof: 0 },
    control: {
      draftChanges: 0,
      changesAwaitingReview: 0,
      openRisks: 0,
      openIssues: 0,
      everRecorded: 0,
    },
    release: { activeBaseline: false, draftBaseline: false, gate: { assessed: false } },
  };
}

export interface ProgressStep extends ProgressStageDefinition {
  state: ProgressState;
  /** What is true right now, as sentences about real rows. */
  facts: string[];
  actionLabel: string;
  destination: ProgressDestination;
  /** The action creates a record — its link opens the destination's "New …" form. */
  opensForm?: boolean;
}

// --- Wording -------------------------------------------------------------------

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 requirements are drafts" / "1 requirement is a draft". */
function are(n: number, one: string, many: string, rest: string, restOne = rest): string {
  return `${count(n, one, many)} ${n === 1 ? "is" : "are"} ${n === 1 ? restOne : rest}`;
}

/**
 * The common shape for records with a draft → review → approved lifecycle:
 * nothing yet, some unfinished, some waiting on a reviewer, or all approved.
 * Unfinished work outranks waiting for review, because it is the author's
 * next move and the review cannot happen until it is done.
 */
function lifecycleState(total: number, drafting: number, inReview: number): ProgressState {
  if (total === 0) return "NOT_STARTED";
  if (drafting > 0) return "IN_PROGRESS";
  if (inReview > 0) return "NEEDS_REVIEW";
  return "READY";
}

function defineStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const { requirements: r, stakeholderNeeds: n } = facts;
  const state = lifecycleState(r.total, r.draft, r.inReview);
  const lines: string[] = [];

  if (r.total === 0) {
    lines.push(
      n.total > 0
        ? `No requirements yet. You have ${count(n.total, "stakeholder need", "stakeholder needs")} to turn into them.`
        : "No requirements yet.",
    );
  } else {
    const approved = r.total - r.draft - r.inReview;
    lines.push(`${count(r.total, "requirement", "requirements")}: ${approved} approved.`);
    if (r.draft > 0) lines.push(`${are(r.draft, "requirement", "requirements", "drafts", "a draft")}.`);
    if (r.inReview > 0) lines.push(`${are(r.inReview, "requirement", "requirements", "waiting for review")}.`);
  }

  const actionLabel = {
    NOT_STARTED: "Write the first requirement",
    IN_PROGRESS: "Finish the drafts",
    NEEDS_REVIEW: "Review requirements",
    READY: "View requirements",
  }[state];

  return { state, facts: lines, actionLabel, destination: "requirements", opensForm: state === "NOT_STARTED" };
}

function designStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const { designItems: d } = facts;
  const state = lifecycleState(d.total, d.draft, d.inReview);
  const lines =
    d.total === 0
      ? ["Nothing described yet."]
      : [
          `${count(d.total, "design item", "design items")}: ${d.total - d.draft - d.inReview} approved.`,
          ...(d.draft > 0 ? [`${are(d.draft, "item", "items", "drafts", "a draft")}.`] : []),
          ...(d.inReview > 0 ? [`${are(d.inReview, "item", "items", "waiting for review")}.`] : []),
        ];

  const actionLabel = {
    NOT_STARTED: "Describe the first part",
    IN_PROGRESS: "Finish the drafts",
    NEEDS_REVIEW: "Review the design",
    READY: "View the design",
  }[state];

  return { state, facts: lines, actionLabel, destination: "design-items", opensForm: state === "NOT_STARTED" };
}

function decideStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const { decisions: d } = facts;
  const state = lifecycleState(d.total, d.proposed, d.underReview);
  const lines =
    d.total === 0
      ? ["No decisions recorded yet."]
      : [
          `${count(d.total, "decision", "decisions")}: ${d.total - d.proposed - d.underReview} approved.`,
          ...(d.proposed > 0 ? [`${are(d.proposed, "decision", "decisions", "proposed and not yet reviewed", "proposed and not yet reviewed")}.`] : []),
          ...(d.underReview > 0 ? [`${are(d.underReview, "decision", "decisions", "under review")}.`] : []),
        ];

  const actionLabel = {
    NOT_STARTED: "Record a decision",
    IN_PROGRESS: "Finish proposed decisions",
    NEEDS_REVIEW: "Review decisions",
    READY: "View decisions",
  }[state];

  return { state, facts: lines, actionLabel, destination: "decisions", opensForm: state === "NOT_STARTED" };
}

/**
 * Verify is the one stage with three independent gaps — a requirement with
 * no way to prove it, a check not yet carried out, a pass with nothing to
 * show for it — so it reports each, and sends the reader to whichever module
 * closes the most important one. A failed check outranks everything: it is
 * the only gap that says something is actually wrong.
 */
function verifyStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const { requirements: r, checks: c } = facts;

  if (c.total === 0) {
    return {
      state: "NOT_STARTED",
      facts: [r.total === 0 ? "Waiting on requirements — there is nothing to verify yet." : "No checks planned yet."],
      actionLabel: "Plan the first check",
      destination: "verification",
      opensForm: true,
    };
  }

  const lines: string[] = [];
  if (c.failed > 0) lines.push(`${count(c.failed, "check", "checks")} failed.`);
  if (r.withoutCheck > 0) lines.push(`${count(r.withoutCheck, "requirement has", "requirements have")} no check yet.`);
  if (c.notRun > 0) lines.push(`${count(c.notRun, "check has", "checks have")} not been carried out yet.`);
  if (c.passedWithoutProof > 0) {
    lines.push(`${count(c.passedWithoutProof, "passed check has", "passed checks have")} no proof attached.`);
  }

  if (c.failed > 0) {
    return { state: "NEEDS_REVIEW", facts: lines, actionLabel: "Review failed checks", destination: "verification" };
  }
  if (r.withoutCheck > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Plan the missing checks", destination: "verification" };
  }
  if (c.notRun > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Record check results", destination: "verification" };
  }
  if (c.passedWithoutProof > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Attach proof", destination: "evidence" };
  }

  return {
    state: "READY",
    facts: [`Every requirement has a check, every check has passed or been waived, and every pass has proof.`],
    actionLabel: "View checks",
    destination: "verification",
  };
}

function controlStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const k = facts.control;

  if (k.everRecorded === 0) {
    return {
      state: "NOT_STARTED",
      // Deliberately not "nothing to worry about": nobody has recorded
      // anything, which says nothing about whether there is anything.
      facts: ["No risks, problems or changes recorded yet. That doesn't mean there are none."],
      actionLabel: "Record a risk or change",
      destination: "risks",
      opensForm: true,
    };
  }

  const lines: string[] = [];
  if (k.changesAwaitingReview > 0) lines.push(`${are(k.changesAwaitingReview, "change", "changes", "waiting for review")}.`);
  if (k.draftChanges > 0) lines.push(`${are(k.draftChanges, "change", "changes", "drafts", "a draft")}.`);
  if (k.openIssues > 0) lines.push(`${are(k.openIssues, "problem", "problems", "still open")}.`);
  if (k.openRisks > 0) lines.push(`${count(k.openRisks, "risk has", "risks have")} no handling decided yet.`);

  if (k.changesAwaitingReview > 0) {
    return { state: "NEEDS_REVIEW", facts: lines, actionLabel: "Review changes", destination: "changes" };
  }
  if (k.draftChanges > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Finish draft changes", destination: "changes" };
  }
  if (k.openIssues > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Work open problems", destination: "issues" };
  }
  if (k.openRisks > 0) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Decide how to handle risks", destination: "risks" };
  }

  return {
    state: "READY",
    facts: ["Every recorded risk, problem and change has been dealt with."],
    actionLabel: "Record a change",
    destination: "changes",
    opensForm: true,
  };
}

/**
 * Release needs two things: a locked version of the design (an active
 * baseline) and a release check that says READY *and is still current*.
 * An UNKNOWN verdict or a stale one needs a person, not a green tick.
 */
function releaseStep(facts: ProjectProgressFacts): Omit<ProgressStep, keyof ProgressStageDefinition> {
  const { activeBaseline, draftBaseline, gate } = facts.release;
  const lines: string[] = [];

  lines.push(
    activeBaseline
      ? "The current version of the design is locked."
      : draftBaseline
        ? "A version of the design is being prepared, but not locked yet."
        : "No version of the design has been locked yet.",
  );

  if (!gate.assessed) {
    lines.push("The release check has not been run.");
  } else if (!gate.current) {
    lines.push("The last release check is out of date — the project has changed since it was run.");
  } else if (gate.status === "READY") {
    lines.push("The release check says ready.");
  } else if (gate.status === "NOT_READY") {
    lines.push(`The release check says not ready: ${count(gate.openFindings, "thing stands", "things stand")} in the way.`);
  } else {
    lines.push(
      `The release check could not reach a verdict: ${count(gate.openFindings, "thing is", "things are")} unknown.`,
    );
  }

  const gateNeedsPerson = gate.assessed && (!gate.current || gate.status !== "READY");

  if (!activeBaseline && !draftBaseline && !gate.assessed) {
    return {
      state: "NOT_STARTED",
      facts: lines,
      actionLabel: "Lock the current design",
      destination: "baselines",
      opensForm: true,
    };
  }
  if (gateNeedsPerson) {
    return {
      state: "NEEDS_REVIEW",
      facts: lines,
      actionLabel: gate.assessed && !gate.current ? "Run the release check again" : "See what's in the way",
      destination: "release-check",
    };
  }
  if (!activeBaseline) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Lock the current design", destination: "baselines" };
  }
  if (!gate.assessed) {
    return { state: "IN_PROGRESS", facts: lines, actionLabel: "Run the release check", destination: "release-check" };
  }

  return { state: "READY", facts: lines, actionLabel: "View the release check", destination: "release-check" };
}

const STEP_BUILDERS: Record<ProgressStage, (facts: ProjectProgressFacts) => Omit<ProgressStep, keyof ProgressStageDefinition>> = {
  DEFINE: defineStep,
  DESIGN: designStep,
  DECIDE: decideStep,
  VERIFY: verifyStep,
  CONTROL: controlStep,
  RELEASE: releaseStep,
};

/** All six stages, in lifecycle order, each with what is actually true of this project. */
export function progressSteps(facts: ProjectProgressFacts): ProgressStep[] {
  return PROGRESS_STAGE_DEFINITIONS.map((definition) => ({
    ...definition,
    ...STEP_BUILDERS[definition.stage](facts),
  }));
}

/**
 * The one thing to suggest.
 *
 * Anything waiting on a person comes first — that is the most actionable
 * thing in the project. Otherwise the earliest unfinished stage.
 *
 * A stage that hasn't been started is passed over when a *later* stage has:
 * a team that went straight to requirements without recording design items
 * has made a choice, and the suggestion should not keep pulling them back to
 * it. That stage still shows NOT_STARTED in the list — nothing is hidden;
 * only the suggestion moves on.
 */
export function nextProgressStep(facts: ProjectProgressFacts): ProgressStep {
  const steps = progressSteps(facts);

  const needsReview = steps.find((step) => step.state === "NEEDS_REVIEW");
  if (needsReview) return needsReview;

  const started = (step: ProgressStep) => step.state !== "NOT_STARTED";
  const unfinished = steps.find((step, index) => {
    if (step.state === "READY") return false;
    if (step.state === "IN_PROGRESS") return true;
    return !steps.slice(index + 1).some(started);
  });

  return unfinished ?? steps[steps.length - 1]!;
}

const STATE_LABELS: Readonly<Record<ProgressState, string>> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  NEEDS_REVIEW: "Needs review",
  READY: "Ready",
};

export function progressStateLabel(state: ProgressState): string {
  return STATE_LABELS[state];
}
