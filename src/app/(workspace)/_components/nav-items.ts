import type { LucideIcon } from "lucide-react";
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
}

/** Primary engineering navigation hierarchy for the authenticated workspace shell. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderGit2 },
  { label: "Requirements", href: "/requirements", icon: ListChecks },
  { label: "Decisions", href: "/decisions", icon: Scale },
  { label: "Changes", href: "/changes", icon: GitBranch },
  { label: "Suppliers", href: "/suppliers", icon: Factory },
  { label: "Traceability", href: "/traceability", icon: Waypoints },
  { label: "Verification", href: "/verification", icon: ShieldCheck },
  { label: "Risks", href: "/risks", icon: ShieldAlert },
];
