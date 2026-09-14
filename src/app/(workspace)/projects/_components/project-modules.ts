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

export interface ProjectModule {
  label: string;
  /** Appended to `/projects/[id]`, e.g. "/requirements". Empty string means the project's own overview page. */
  href: string;
  icon: LucideIcon;
  description: string;
}

/**
 * The artifact modules that actually exist for one project, in one place.
 *
 * This used to live only inside the project overview grid
 * (`project-detail-view.tsx`); it is now also the source of truth for the
 * project-scoped tab bar (`project-tabs.tsx`) shown on every module page, so
 * the two can never silently disagree about which modules exist or what they
 * are called. Nothing is listed here that a user cannot open — unbuilt
 * modules are named in the project overview's empty state instead, not here.
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
  },
  {
    label: "Stakeholder needs",
    href: "/stakeholder-needs",
    icon: Users,
    description: "The originating needs requirements derive from.",
  },
  {
    label: "Design items",
    href: "/design-items",
    icon: Boxes,
    description: "Product structure that requirements are allocated to.",
  },
  {
    label: "Verification",
    href: "/verification",
    icon: ShieldCheck,
    description: "How requirements are shown to be met.",
  },
  {
    label: "Evidence",
    href: "/evidence",
    icon: FileText,
    description: "Controlled engineering evidence: what it is, where it came from, and what depends on it.",
  },
  {
    label: "Decisions",
    href: "/decisions",
    icon: Scale,
    description: "What was decided, why, and what it depended on.",
  },
  {
    label: "Changes",
    href: "/changes",
    icon: GitBranch,
    description: "Proposed changes and what each one declares it affects.",
  },
  {
    label: "Risks",
    href: "/risks",
    icon: ShieldAlert,
    description: "What could go wrong, why, and what is being done about it.",
  },
  {
    label: "Issues",
    href: "/issues",
    icon: CircleAlert,
    description: "Problems actually found, their owners, and their disposition.",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Factory,
    description: "Supplier engineering dependencies, and what the product relies on them for.",
  },
  {
    label: "Baselines",
    href: "/baselines",
    icon: Layers,
    description: "The approved engineering basis that drift is measured against.",
  },
  {
    label: "Observations",
    href: "/observations",
    icon: Radar,
    description: "What has actually been observed in operation.",
  },
  {
    label: "Drift",
    href: "/drift",
    icon: Activity,
    description: "Where operational reality no longer matches the approved basis.",
  },
  {
    label: "Certification",
    href: "/certification",
    icon: FileCheck,
    description: "Certification obligations, traced to the engineering evidence that supports them.",
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
