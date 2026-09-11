import { Archive, CircleDot } from "lucide-react";
import type { ProjectStatus } from "@/domain";
import { Badge } from "@/components/ui/badge";

/**
 * Project status indicator, shared by the projects table, project detail, and
 * the dashboard card so a status always reads the same way.
 *
 * Status is carried by the label and an icon, not by color alone.
 */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const isActive = status === "ACTIVE";
  const Icon = isActive ? CircleDot : Archive;

  return (
    <Badge variant={isActive ? "success" : "secondary"}>
      <Icon className="size-3" aria-hidden="true" />
      {isActive ? "Active" : "Archived"}
    </Badge>
  );
}
