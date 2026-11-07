import Link from "next/link";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectDto } from "@/lib/api/projects";
import { formatIsoDate } from "@/lib/utils";

/**
 * Dense project listing. The name is the navigation target — straight into
 * Command Center, not the project overview page. Command Center is the
 * front door: it composes what needs attention across the whole project and
 * computes nothing itself, which is exactly the shape a landing surface
 * should have. The overview page (module grid, archive/edit) stays one
 * click away from there, not the first thing shown.
 */
export function ProjectTable({ projects }: { projects: ProjectDto[] }) {
  return (
    <Table>
      <TableCaption className="sr-only">
        Projects in this organization, most recently created first.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="max-w-md whitespace-normal">
              <Link
                href={`/projects/${project.id}/command-center`}
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {project.name}
              </Link>
              {project.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {project.description}
                </p>
              )}
            </TableCell>
            <TableCell>
              <ProjectStatusBadge status={project.status} />
            </TableCell>
            <TableCell className="font-mono text-muted-foreground" title={project.createdAt}>
              {formatIsoDate(project.createdAt)}
            </TableCell>
            <TableCell className="font-mono text-muted-foreground" title={project.updatedAt}>
              {formatIsoDate(project.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
