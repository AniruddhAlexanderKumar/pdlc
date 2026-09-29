import type { LucideIcon } from "lucide-react";
import type { TerminologyLabelKey } from "@/domain";
import { PROGRESS_STAGE_DEFINITIONS, type ProgressStage } from "@/domain/project-progress";
import {
  Activity,
  Boxes,
  CircleAlert,
  Compass,
  Eye,
  Factory,
  FileCheck,
  FileText,
  GitBranch,
  History,
  Layers,
  LayoutDashboard,
  ListChecks,
  Radar,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  Waypoints,
  Wrench,
} from "lucide-react";

export interface ProjectModule {
  label: string;
  /** Appended to `/projects/[id]`, e.g. "/requirements". */
  href: string;
  icon: LucideIcon;
  description: string;
  /**
   * Which organization-customizable noun this module's `label` is the
   * default text for — `resolveTerminologyLabel` (see `@/domain`) reads
   * this key against the organization's own overrides wherever this
   * module's name is shown. `undefined` for a module that names a system
   * capability rather than an industry noun (Command Center, Decision
   * Sentinel, Traceability, Engineering History, Members) — those are not
   * overridable, and `label` always renders unchanged for them.
   */
  labelKey?: TerminologyLabelKey;
}

/**
 * The modules that actually exist for one project, in one place — the
 * sidebar, the tab bar above each module, the project page's module list,
 * Settings and the command palette all read this, so none of them can
 * disagree about which modules exist or what they are called. Nothing is
 * listed here that a user cannot open.
 */
export const PROJECT_MODULES: readonly ProjectModule[] = [
  {
    label: "Command Center",
    href: "/command-center",
    icon: LayoutDashboard,
    description: "One view of what needs attention and the current readiness/traceability state.",
  },
  {
    label: "Requirements",
    href: "/requirements",
    icon: ListChecks,
    description: "Author requirements, manage their lifecycle and trace them.",
    labelKey: "requirement",
  },
  {
    label: "Stakeholder needs",
    href: "/stakeholder-needs",
    icon: Users,
    description: "The originating needs requirements derive from.",
    labelKey: "stakeholderNeed",
  },
  {
    label: "Design items",
    href: "/design-items",
    icon: Boxes,
    description: "Product structure that requirements are allocated to.",
    labelKey: "designItem",
  },
  {
    label: "Verification",
    href: "/verification",
    icon: ShieldCheck,
    description: "How requirements are shown to be met.",
    labelKey: "verificationActivity",
  },
  {
    label: "Evidence",
    href: "/evidence",
    icon: FileText,
    description: "Controlled engineering evidence: what it is, where it came from, and what depends on it.",
    labelKey: "evidence",
  },
  {
    label: "Decisions",
    href: "/decisions",
    icon: Scale,
    description: "What was decided, why, and what it depended on.",
    labelKey: "decision",
  },
  {
    label: "Changes",
    href: "/changes",
    icon: GitBranch,
    description: "Proposed changes and what each one declares it affects.",
    labelKey: "changeRequest",
  },
  {
    label: "Risks",
    href: "/risks",
    icon: ShieldAlert,
    description: "What could go wrong, why, and what is being done about it.",
    labelKey: "risk",
  },
  {
    label: "Issues",
    href: "/issues",
    icon: CircleAlert,
    description: "Problems actually found, their owners, and their disposition.",
    labelKey: "issue",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Factory,
    description: "Supplier engineering dependencies, and what the product relies on them for.",
    labelKey: "supplier",
  },
  {
    label: "Baselines",
    href: "/baselines",
    icon: Layers,
    description: "The approved engineering basis that drift is measured against.",
    labelKey: "baseline",
  },
  {
    label: "Observations",
    href: "/observations",
    icon: Radar,
    description: "What has actually been observed in operation.",
    labelKey: "observation",
  },
  {
    label: "Drift",
    href: "/drift",
    icon: Activity,
    description: "Where operational reality no longer matches the approved basis.",
    labelKey: "drift",
  },
  {
    label: "Certification",
    href: "/certification",
    icon: FileCheck,
    description: "Certification obligations, traced to the engineering evidence that supports them.",
    labelKey: "certification",
  },
  {
    label: "Decision Sentinel",
    href: "/sentinel",
    icon: Eye,
    description: "Surveillance signals for engineering changes that may need re-review.",
  },
  {
    label: "Traceability",
    href: "/traceability",
    icon: Waypoints,
    description: "Trace real relationships across the engineering graph, hop by hop.",
  },
  {
    label: "Engineering History",
    href: "/history",
    icon: History,
    description: "The chronological record of what happened, and when, across this project.",
  },
  {
    label: "Members",
    href: "/members",
    icon: UserCog,
    description: "Who can access this project, and in what role.",
  },
] as const;

export function findProjectModule(href: string): ProjectModule | undefined {
  return PROJECT_MODULES.find((module) => module.href === href);
}

/**
 * One entry in the sidebar, and the pages it holds — each page becomes a
 * tab above the content (`ProjectSectionTabs`) once the section is open.
 *
 * This is the whole navigation model: a short sidebar of places, tabs for
 * the pages inside the one you are in. Most of the sidebar is the six
 * steps of the work, in order and numbered — the same six the project
 * page's "Start here" panel walks through — so someone who has never used
 * a lifecycle tool can follow them top to bottom.
 */
export interface ProjectSection {
  id: string;
  label: string;
  /** 1–6 for the six steps of the work, in order; absent for everything else. */
  step?: number;
  /** The step's stage — the same stage `MODULE_GUIDES` gives each of its modules. */
  stage?: ProgressStage;
  /** The plain question a step answers, shown under its name. */
  question?: string;
  /** Shown instead of a step number. */
  icon?: LucideIcon;
  /** Module hrefs in tab order; the first is where the sidebar link goes. "" is the project's own page. */
  modules: readonly string[];
}

/** Each step's pages, first page first — it is where the step's sidebar link lands. */
const STEP_MODULES: Readonly<Record<ProgressStage, readonly string[]>> = {
  DEFINE: ["/requirements", "/stakeholder-needs"],
  DESIGN: ["/design-items", "/suppliers"],
  DECIDE: ["/decisions"],
  VERIFY: ["/verification", "/evidence"],
  CONTROL: ["/changes", "/risks", "/issues", "/observations", "/drift"],
  RELEASE: ["/baselines", "/certification"],
};

export const PROJECT_SECTIONS: readonly ProjectSection[] = [
  { id: "overview", label: "Overview", icon: Compass, modules: [""] },
  { id: "command-center", label: "Command Center", icon: LayoutDashboard, modules: ["/command-center"] },
  ...PROGRESS_STAGE_DEFINITIONS.map(
    (definition, index): ProjectSection => ({
      id: definition.stage.toLowerCase(),
      label: definition.title,
      step: index + 1,
      stage: definition.stage,
      question: definition.question,
      modules: STEP_MODULES[definition.stage],
    }),
  ),
  { id: "tools", label: "Project tools", icon: Wrench, modules: ["/traceability", "/history", "/sentinel"] },
  { id: "team", label: "Team", icon: UserCog, modules: ["/members"] },
];

export const STEP_COUNT = PROJECT_SECTIONS.filter((section) => section.step !== undefined).length;

/** Pages with their own top-level path that belong to another module's tab. */
const MODULE_ALIASES: Readonly<Record<string, string>> = {
  "/supplied-items": "/suppliers",
  "/supplier-qualifications": "/suppliers",
};

/**
 * Which module a path is in — "/requirements" for
 * `/projects/p1/requirements/REQ-1`, "" for the project's own page — or
 * null outside a project.
 */
export function moduleForPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/[^/]+(\/[^/]+)?/);
  if (!match) return null;
  const segment = match[1] ?? "";
  return MODULE_ALIASES[segment] ?? segment;
}

export function sectionForModule(moduleHref: string): ProjectSection | undefined {
  return PROJECT_SECTIONS.find((section) => section.modules.includes(moduleHref));
}
