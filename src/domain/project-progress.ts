/**
 * "What should I do next?" for one project, answered from its real rows.
 *
 * Someone opening a project for the first time was shown a Sentinel card, a
 * Technical Readiness panel, and a grid of about twenty module links with
 * names like "Drift", "Baselines" and "Certification Basis" — and nothing
 * saying where to start. This module is the answer to that one question.
 *
 * The product already has a real lifecycle, and it is short: say what the
 * product must do, decide how you will check each of those things, attach
 * the proof, and keep the record current when something changes. Each of
 * the first three is either true of a project or not, and each "not" is a
 * count of specific rows. So the next step is simply the first stage that
 * isn't done — computed, not guessed.
 *
 * **Deliberately no aggregate.** There is no "2 of 4 complete" and no
 * progress bar. A ratio of stages would be a score in everything but name:
 * it treats "no requirements yet" and "one check missing proof" as equal
 * quarters of some whole, which they are not. Each stage reports its own
 * count, and that count is the claim. `project-progress.test.ts` asserts no
 * ratio or percentage can appear in anything this module produces.
 *
 * Plain words on purpose: a reader who has never heard "verification
 * activity" understands "a check — how you'll prove it". The organization's
 * own names for these modules are still applied to buttons, where they
 * matter for finding the page again.
 */

export interface ProjectProgressCounts {
  stakeholderNeeds: number;
  /** Requirements not marked obsolete — an obsolete one needs no check. */
  requirements: number;
  /** Of those, how many have no verification activity linked at all. */
  requirementsWithoutCheck: number;
  verificationActivities: number;
  /** Of those, how many have no evidence linked at all. */
  checksWithoutProof: number;
  /** Change requests still in play: drafted, submitted, or under review. */
  openChanges: number;
}

export const PROGRESS_STAGES = ["DEFINE", "PLAN_CHECKS", "ATTACH_PROOF", "KEEP_CURRENT"] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

/**
 * The modules the four stages send a reader to, in stage order — the path
 * suffix under `/projects/:id`. Exported so anything that decides which
 * modules are "essential" (the sidebar's Simplify mode) agrees with the
 * next-step panel by construction, instead of by someone remembering to.
 */
export const PROGRESS_MODULES = ["requirements", "verification", "evidence", "changes"] as const;
export type ProgressModule = (typeof PROGRESS_MODULES)[number];

export interface ProgressStep {
  stage: ProgressStage;
  /** The stage in the reader's words, e.g. "Say what it must do". */
  title: string;
  /** Why this stage exists, for someone who has never used a tool like this. */
  explanation: string;
  /** What is true right now, stated as a fact about real rows. */
  status: string;
  done: boolean;
  actionLabel: string;
  module: ProgressModule;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The four stages, each with what is actually true of this project.
 *
 * `KEEP_CURRENT` is never "done" — keeping a record current is ongoing,
 * not a box to tick — so it is only ever offered as the next step once the
 * other three genuinely are.
 */
export function progressSteps(counts: ProjectProgressCounts): ProgressStep[] {
  const defined = counts.requirements > 0;
  const planned = defined && counts.requirementsWithoutCheck === 0;
  const proven =
    planned && counts.verificationActivities > 0 && counts.checksWithoutProof === 0;

  return [
    {
      stage: "DEFINE",
      title: "Say what it must do",
      explanation:
        "Write each thing the product has to do as its own requirement — one sentence, specific enough that someone could check it.",
      status: defined
        ? `${plural(counts.requirements, "requirement", "requirements")} written.`
        : counts.stakeholderNeeds > 0
          ? `No requirements yet. You have ${plural(counts.stakeholderNeeds, "stakeholder need", "stakeholder needs")} to turn into them.`
          : "No requirements yet.",
      done: defined,
      actionLabel: defined ? "Review requirements" : "Write the first requirement",
      module: "requirements",
    },
    {
      stage: "PLAN_CHECKS",
      title: "Decide how you'll check each one",
      explanation:
        "For every requirement, record how you will prove it is met — a test, an analysis, an inspection, or a demonstration.",
      status: !defined
        ? "Waiting on requirements."
        : counts.requirementsWithoutCheck === 0
          ? "Every requirement has a way to check it."
          : `${plural(counts.requirementsWithoutCheck, "requirement has", "requirements have")} no check yet.`,
      done: planned,
      actionLabel: "Plan checks",
      module: "verification",
    },
    {
      stage: "ATTACH_PROOF",
      title: "Attach the proof",
      explanation:
        "When a check is carried out, attach what it produced — a test report, a calculation, an inspection record — so the result can be found later.",
      status:
        counts.verificationActivities === 0
          ? "No checks planned yet, so nothing to prove."
          : counts.checksWithoutProof === 0
            ? "Every check has proof attached."
            : `${plural(counts.checksWithoutProof, "check has", "checks have")} no proof attached.`,
      done: proven,
      actionLabel: "Attach proof",
      module: "evidence",
    },
    {
      stage: "KEEP_CURRENT",
      title: "Keep it current",
      explanation:
        "When something needs to change, record it as a change request first. The product then shows everything that change would affect, before anyone edits anything.",
      status:
        counts.openChanges === 0
          ? "No changes in progress."
          : `${plural(counts.openChanges, "change is", "changes are")} in progress.`,
      done: false,
      actionLabel: counts.openChanges > 0 ? "Review changes" : "Record a change",
      module: "changes",
    },
  ];
}

/** The first stage that still needs doing — the one thing to suggest. */
export function nextProgressStep(counts: ProjectProgressCounts): ProgressStep {
  const steps = progressSteps(counts);
  return steps.find((step) => !step.done) ?? steps[steps.length - 1]!;
}
