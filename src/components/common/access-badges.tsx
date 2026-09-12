import type { ProjectRole } from "@/domain";
import { organizationRoleLabel, projectRoleLabel } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Role indicators for Engineering Access Control.
 *
 * `ProjectRole` is a real domain enum; organization role as carried on a
 * `ProjectMember.user.organizationRole` arrives over the wire as a plain
 * string (it is read-only display data here, never re-validated as a role
 * value), so `OrganizationRoleBadge` accepts either "OWNER" or anything
 * else and falls back to the label the domain gives ordinary members.
 */

const PROJECT_ROLE_VARIANTS: Record<ProjectRole, "default" | "info" | "warning" | "outline"> = {
  MANAGER: "default",
  ENGINEER: "info",
  REVIEWER: "warning",
  VIEWER: "outline",
};

export function ProjectRoleBadge({ role }: { role: ProjectRole }) {
  return <Badge variant={PROJECT_ROLE_VARIANTS[role]}>{projectRoleLabel(role)}</Badge>;
}

export function OrganizationRoleBadge({ organizationRole }: { organizationRole: string }) {
  const role = organizationRole === "OWNER" ? "OWNER" : "MEMBER";
  return <Badge variant={role === "OWNER" ? "secondary" : "outline"}>{organizationRoleLabel(role)}</Badge>;
}
