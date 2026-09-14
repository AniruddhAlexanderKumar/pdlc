import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Boxes,
  CircleAlert,
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
} from "lucide-react";

/**
 * The six things an engineer is actually trying to do, independent of which
 * table a record lives in — the navigation groups modules by this, not by
 * schema. Command Center sits outside every group deliberately: it is the
 * landing surface, not a peer of what it summarizes.
 */
export type ModuleGroupId = "understand" | "define" | "decide" | "prove" | "change" | "certify";

export const MODULE_GROUPS: ReadonlyArray<{ id: ModuleGroupId; label: string }> = [
  { id: "understand", label: "Understand" },
  { id: "define", label: "Define" },
  { id: "decide", label: "Decide" },
  { id: "prove", label: "Prove" },
  { id: "change", label: "Change" },
  { id: "certify", label: "Certify" },
] as const;

/**
 * How often an engineer actually touches this module in a week — the
 * ranking Master Prompt 3 asked for, made real rather than left as a
 * one-time report. Drives the sidebar's "Simplify" mode: daily-tier modules
 * stay, everything else collapses out until the engineer asks for it back.
 * This is a rough, honest estimate grounded in what each module is *for*
 * (a program owner opens Requirements/Decisions/Risks/Issues constantly;
 * Certification or Baselines get real attention only around a milestone),
 * not a measurement — no usage instrumentation exists to measure it from.
 */
export type ModuleTier = "daily" | "weekly" | "occasional";

export interface ProjectModule {
  label: string;
  /** Appended to `/projects/[id]`, e.g. "/requirements". Empty string means the project's own overview page. */
  href: string;
  icon: LucideIcon;
  description: string;
  /**
   * Which of the six work-groups this belongs to in navigation, or `null`
   * for a module that does not get permanent sidebar residency — reached
   * instead through the project overview page, Command Center's own
   * sections, and (once it exists) search. Not a judgment that the module
   * matters less; it is what "occasional" in the module ranking means in
   * practice — see ARCHITECTURE.md and the master-prompt-3 report for the
   * full weekly/occasional reasoning.
   */
  group: ModuleGroupId | null;
  tier: ModuleTier;
}

/**
 * The artifact modules that actually exist for one project, in one place.
 *
 * Source of truth for the project overview grid (`project-detail-view.tsx`)
 * AND the sidebar's project-scoped navigation (`sidebar.tsx`), so the two can
 * never silently disagree about which modules exist, what they are called,
 * or which work-group they belong to. Nothing is listed here that a user
 * cannot open — unbuilt modules are named in the project overview's empty
 * state instead, not here.
 */
export const PROJECT_MODULES: readonly ProjectModule[] = [
  {
    label: "Command Center",
    href: "/command-center",
    icon: LayoutDashboard,
    description: "One view of what needs attention and the current readiness/traceability state.",
    group: null,
    tier: "daily",
  },
  {
    label: "Requirements",
    href: "/requirements",
    icon: ListChecks,
    description: "Author requirements, manage their lifecycle and trace them.",
    group: "define",
    tier: "daily",
  },
  {
    label: "Stakeholder needs",
    href: "/stakeholder-needs",
    icon: Users,
    description: "The originating needs requirements derive from.",
    group: "define",
    tier: "occasional",
  },
  {
    label: "Design items",
    href: "/design-items",
    icon: Boxes,
    description: "Product structure that requirements are allocated to.",
    group: "define",
    tier: "weekly",
  },
  {
    label: "Verification",
    href: "/verification",
    icon: ShieldCheck,
    description: "How requirements are shown to be met.",
    group: "prove",
    tier: "weekly",
  },
  {
    label: "Evidence",
    href: "/evidence",
    icon: FileText,
    description: "Controlled engineering evidence: what it is, where it came from, and what depends on it.",
    group: "prove",
    tier: "weekly",
  },
  {
    label: "Decisions",
    href: "/decisions",
    icon: Scale,
    description: "What was decided, why, and what it depended on.",
    group: "decide",
    tier: "daily",
  },
  {
    label: "Changes",
    href: "/changes",
    icon: GitBranch,
    description: "Proposed changes and what each one declares it affects.",
    group: "change",
    tier: "weekly",
  },
  {
    label: "Risks",
    href: "/risks",
    icon: ShieldAlert,
    description: "What could go wrong, why, and what is being done about it.",
    group: "change",
    tier: "daily",
  },
  {
    label: "Issues",
    href: "/issues",
    icon: CircleAlert,
    description: "Problems actually found, their owners, and their disposition.",
    group: "change",
    tier: "daily",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Factory,
    description: "Supplier engineering dependencies, and what the product relies on them for.",
    group: null,
    tier: "occasional",
  },
  {
    label: "Baselines",
    href: "/baselines",
    icon: Layers,
    description: "The approved engineering basis that drift is measured against.",
    group: "understand",
    tier: "occasional",
  },
  {
    label: "Observations",
    href: "/observations",
    icon: Radar,
    description: "What has actually been observed in operation.",
    group: "understand",
    tier: "occasional",
  },
  {
    label: "Drift",
    href: "/drift",
    icon: Activity,
    description: "Where operational reality no longer matches the approved basis.",
    group: "understand",
    tier: "weekly",
  },
  {
    label: "Certification",
    href: "/certification",
    icon: FileCheck,
    description: "Certification obligations, traced to the engineering evidence that supports them.",
    group: "certify",
    tier: "occasional",
  },
  {
    label: "Decision Sentinel",
    href: "/sentinel",
    icon: Eye,
    description: "Surveillance signals for engineering changes that may need re-review.",
    group: "understand",
    tier: "weekly",
  },
  {
    label: "Traceability",
    href: "/traceability",
    icon: Waypoints,
    description: "Trace real relationships across the engineering graph, hop by hop.",
    group: "understand",
    tier: "weekly",
  },
  {
    label: "Engineering History",
    href: "/history",
    icon: History,
    description: "The chronological record of what happened, and when, across this project.",
    group: "understand",
    tier: "occasional",
  },
  {
    label: "Members",
    href: "/members",
    icon: UserCog,
    description: "Who can access this project, and in what role.",
    group: null,
    tier: "occasional",
  },
] as const;
