import type { ProgressStage } from "./project-progress";

/**
 * What each part of a project is for, in plain words.
 *
 * Someone new to lifecycle software meets about twenty modules with names
 * like "Baselines", "Drift" and "Certification basis". Every page therefore
 * opens with three short answers — what this is, why it matters, what to
 * do first — written for a reader who has never used a tool like this.
 *
 * Kept here, in one file, rather than in each page, so the product explains
 * itself in one voice and a new module cannot ship without an explanation:
 * `module-guide.test.ts` asserts every module in the navigation has one.
 *
 * The canonical engineering term is kept as `technicalName` wherever the
 * plain framing differs from it. This is presentation only — no model,
 * route or record is renamed — and the technical term stays visible, so an
 * experienced engineer can still find their bearings.
 *
 * Deliberately careful never to promise more than a module does: the
 * certification guide says it is not an approval, the Sentinel guide says
 * there is nothing to do until something changes.
 */

export interface ModuleGuide {
  /** "What is this?" — one sentence. */
  what: string;
  /** "Why does it matter?" — one sentence. */
  why: string;
  /** "What should I do first?" — one sentence, an action. */
  first: string;
  /** The engineering term for this concept, where the plain framing differs from it. */
  technicalName?: string;
  /** The stage of the project's work this module serves, or null when it serves all of them. */
  stage: ProgressStage | null;
}

/** Keyed by the module's path under `/projects/:id`, exactly as `PROJECT_MODULES` lists them. */
export const MODULE_GUIDES = {
  "/command-center": {
    what: "Everything in this project that needs a person's attention right now.",
    why: "One place to see every open question, each shown with the reason it was raised.",
    first: "Start at the top of the list — it is ordered so what needs someone most comes first.",
    stage: null,
  },
  "/stakeholder-needs": {
    what: "What someone needs the product to achieve, in their own words.",
    why: "Requirements are written to satisfy these, so you can always show why a requirement exists.",
    first: "Record who needs what, then turn each need into one or more requirements.",
    stage: "DEFINE",
  },
  "/requirements": {
    what: "Something the product must do, written so that someone could check it was done.",
    why: "Design, checks and proof all trace back to these — they are what the rest of the work is for.",
    first: "Write one requirement per thing the product must do. A draft is fine; you can refine it later.",
    stage: "DEFINE",
  },
  "/design-items": {
    what: "A part of the product — a system, assembly, component or piece of software.",
    why: "Linking each requirement to the part that meets it shows what every part is responsible for.",
    first: "Start with the top-level system, then add the parts inside it.",
    stage: "DESIGN",
  },
  "/decisions": {
    what: "An important engineering choice: what was chosen, what else was considered, and why.",
    why: "Without the reason, the next engineer cannot tell whether the choice still holds when things change.",
    first: "Record a choice you have already made — what you chose, and why.",
    technicalName: "Engineering decision",
    stage: "DECIDE",
  },
  "/verification": {
    what: "How you will prove a requirement is met — by a test, an analysis, an inspection or a demonstration.",
    why: "A requirement nobody can check is only a hope. This is where each one gets a way to be proven.",
    first: "Pick a requirement and plan how you will prove it.",
    technicalName: "Verification activity",
    stage: "VERIFY",
  },
  "/evidence": {
    what: "The record that shows a check was done — a test report, a calculation, an inspection sheet.",
    why: "Proof you can find again later. Once validated it is locked, so it cannot change after the fact.",
    first: "Attach evidence to a check once that check has been carried out.",
    stage: "VERIFY",
  },
  "/changes": {
    what: "A change you want to make, recorded before anyone makes it.",
    why: "The product shows everything a change would affect before anything is edited, so nothing is missed.",
    first: "Describe the change and why it is needed, then check what it affects.",
    technicalName: "Change request",
    stage: "CONTROL",
  },
  "/risks": {
    what: "Something that might cause a problem but has not happened yet.",
    why: "Recording it early lets you decide how to handle it before it happens, instead of after.",
    first: "Record the risk, then decide what to do about it: reduce it, accept it, or keep watching it.",
    stage: "CONTROL",
  },
  "/issues": {
    what: "Something that has already gone wrong.",
    why: "Tracking it through to a fix means it is not forgotten, and is less likely to happen again.",
    first: "Describe what went wrong, how serious it is, and who is fixing it.",
    stage: "CONTROL",
  },
  "/suppliers": {
    what: "An outside company whose parts or work your design depends on.",
    why: "Linking what they supply to your requirements shows what a supplier problem would affect.",
    first: "Record the supplier, then add what they supply to this project.",
    stage: "DESIGN",
  },
  "/baselines": {
    what: "A locked version of the product's design, kept as a fixed point of reference.",
    why: "Once a version is locked, you can see exactly what has changed since — nothing drifts unnoticed.",
    first: "Choose the records that make up the current design, then lock them as a version.",
    technicalName: "Engineering baseline",
    stage: "RELEASE",
  },
  "/observations": {
    what: "Something seen in testing or in service — a measurement, an inspection, a report from the field.",
    why: "Compared with the locked design, observations show where the real product has started to differ.",
    first: "Record what was observed and where it came from.",
    technicalName: "Operational observation",
    stage: "CONTROL",
  },
  "/drift": {
    what: "Where what has been observed no longer matches the locked version of the design.",
    why: "It catches the gap between the product as designed and the product as it really is.",
    first: "You need a locked version of the design and some observations first; then run the comparison.",
    technicalName: "Design–operations drift",
    stage: "CONTROL",
  },
  "/certification": {
    what: "The obligations your product must meet for approval, and how you will show each one is met.",
    why: "It keeps the proof for every obligation together. It tracks your own work — it is not itself an approval.",
    first: "Set up the programme, then record the standard you are working to.",
    stage: "RELEASE",
  },
  "/sentinel": {
    what: "A watch for changes that call an earlier analysis into question.",
    why: "When something changes, you are told which earlier conclusions may no longer hold, and why.",
    first: "Nothing to do until something changes — then look at what it has flagged.",
    technicalName: "Decision Sentinel",
    stage: null,
  },
  "/traceability": {
    what: "How everything connects — needs, requirements, design, decisions, checks and proof.",
    why: "It answers the two questions that matter most: why does this exist, and what depends on it?",
    first: "Pick any record and follow its links from one thing to the next.",
    stage: null,
  },
  "/history": {
    what: "Everything that has happened to this project's records, in the order it happened.",
    why: "It answers who changed what, and when — and it can never be edited or deleted.",
    first: "Narrow it by kind of record or by person to find a particular change.",
    technicalName: "Engineering history",
    stage: null,
  },
  "/members": {
    what: "Who can see this project, and what each person is allowed to do in it.",
    why: "Each person's role decides whether they can read, edit, or approve work here.",
    first: "Add the people who will work on this project, and give each the role they need.",
    stage: null,
  },
} as const satisfies Record<string, ModuleGuide>;

export type GuidedModule = keyof typeof MODULE_GUIDES;

export function moduleGuide(module: GuidedModule): ModuleGuide {
  return MODULE_GUIDES[module];
}

/**
 * Plain words for the specialised concepts that appear *inside* a module's
 * pages, per the brief's own examples. The technical term is kept alongside
 * for anyone who knows it.
 */
export const PLAIN_TERMS = {
  impactRoot: { plain: "Starting point for this change", technical: "Impact analysis root" },
  impactFinding: { plain: "Possibly affected", technical: "Impact finding" },
  decisionExpectation: { plain: "What we expected to happen", technical: "Decision expectation" },
  verificationReadiness: { plain: "Is this ready to be carried out?", technical: "Verification readiness" },
  technicalReadiness: { plain: "Is the engineering work ready to move forward?", technical: "Technical readiness" },
  baseline: { plain: "Locked version of the design", technical: "Engineering baseline" },
} as const;
