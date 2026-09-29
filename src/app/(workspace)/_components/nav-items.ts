import type { LucideIcon } from "lucide-react";
import type { TerminologyLabelKey } from "@/domain";
import {
  Factory,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Waypoints,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Same meaning as `ProjectModule.labelKey` — see its own comment. */
  labelKey?: TerminologyLabelKey;
}

/**
 * The workspace's top-level pages — Dashboard, Projects, and the
 * "pick a project, then open its X" pages — for the command palette and
 * breadcrumbs. The sidebar itself shows only Dashboard and Projects outside
 * a project; everything else is reached by opening one.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderGit2 },
  { label: "Requirements", href: "/requirements", icon: ListChecks, labelKey: "requirement" },
  { label: "Decisions", href: "/decisions", icon: Scale, labelKey: "decision" },
  { label: "Changes", href: "/changes", icon: GitBranch, labelKey: "changeRequest" },
  { label: "Suppliers", href: "/suppliers", icon: Factory, labelKey: "supplier" },
  { label: "Traceability", href: "/traceability", icon: Waypoints },
  { label: "Verification", href: "/verification", icon: ShieldCheck, labelKey: "verificationActivity" },
  { label: "Risks", href: "/risks", icon: ShieldAlert, labelKey: "risk" },
];
