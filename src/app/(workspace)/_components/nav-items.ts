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
  Store,
  Waypoints,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Same meaning as `ProjectModule.labelKey` — see its own comment. */
  labelKey?: TerminologyLabelKey;
}

/** Primary engineering navigation hierarchy for the authenticated workspace shell. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderGit2 },
  { label: "Requirements", href: "/requirements", icon: ListChecks, labelKey: "requirement" },
  { label: "Decisions", href: "/decisions", icon: Scale, labelKey: "decision" },
  { label: "Changes", href: "/changes", icon: GitBranch, labelKey: "changeRequest" },
  { label: "Suppliers", href: "/suppliers", icon: Factory, labelKey: "supplier" },
  { label: "Integrations", href: "/integrations", icon: Store },
  { label: "Traceability", href: "/traceability", icon: Waypoints },
  { label: "Verification", href: "/verification", icon: ShieldCheck, labelKey: "verificationActivity" },
  { label: "Risks", href: "/risks", icon: ShieldAlert, labelKey: "risk" },
];
