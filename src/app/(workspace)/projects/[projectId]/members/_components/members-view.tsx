"use client";

import * as React from "react";
import { AlertTriangle, Plus, RefreshCw, UserPlus, Users } from "lucide-react";
import { PROJECT_ROLES, type ProjectRole, projectRoleDescription } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useOrganizationMembers } from "@/lib/api/organization-membership";
import {
  addProjectMember,
  changeProjectMemberRole,
  removeProjectMember,
  useMyProjectAccess,
  useProjectMembers,
  type ProjectMemberDto,
} from "@/lib/api/project-membership";
import { useProject } from "@/lib/api/projects";
import { OrganizationRoleBadge, ProjectRoleBadge } from "@/components/common/access-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddOrganizationMemberDialog } from "./add-organization-member-dialog";

/**
 * Project Members / Access.
 *
 * Explicit project membership is the whole mechanism behind "organization
 * membership no longer implies project access" — every row here is a real
 * `ProjectMembership`, or the organization's owner (who needs none). Every
 * mutation on this page requires MANAGER on this project (or the
 * organization owner), enforced server-side; hiding a control here is
 * convenience only.
 */
export function MembersView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const members = useProjectMembers(projectId);
  const access = useMyProjectAccess(projectId);
  const orgMembers = useOrganizationMembers();
  const [isAddOrgMemberOpen, setIsAddOrgMemberOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const canManage = access.state.phase === "ready" && access.state.data.role === "MANAGER";
  const isOrganizationOwner =
    access.state.phase === "ready" && access.state.data.isOrganizationOwner;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        description={
          projectName
            ? `Who can access ${projectName}, and what they can do.`
            : "Who can access this project, and what they can do."
        }
      />

      {access.state.phase === "ready" && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Your role on this project:</span>
          <ProjectRoleBadge role={access.state.data.role} />
          <span>— {projectRoleDescription(access.state.data.role)}</span>
        </p>
      )}

      {members.state.phase === "loading" && <LoadingState label="Loading members…" />}

      {members.state.phase === "error" && (
        <ErrorPanel error={members.state.error} onRetry={members.reload} />
      )}

      {members.state.phase === "ready" && (
        <Card>
          <CardHeader>
            <CardTitle>Project members</CardTitle>
            <CardDescription>
              Organization membership alone does not grant project access — each person below has
              an explicit role on this project, or administers the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.state.data.length === 0 ? (
              <EmptyState
                icon={<Users aria-hidden="true" />}
                title="No explicit members yet"
                description="Only the organization's owner can currently reach this project."
              />
            ) : (
              <Table>
                <TableCaption className="sr-only">Members of this project.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Project role</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.state.data.map((member) => (
                    <MemberRow
                      key={member.id}
                      projectId={projectId}
                      member={member}
                      canManage={canManage}
                      onChanged={members.reload}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && members.state.phase === "ready" && (
        <AddMemberCard
          projectId={projectId}
          existingMemberUserIds={new Set(members.state.data.map((row) => row.user.id))}
          isOrganizationOwner={isOrganizationOwner}
          onAdded={members.reload}
          onRequestAddOrgMember={() => setIsAddOrgMemberOpen(true)}
        />
      )}

      <AddOrganizationMemberDialog
        open={isAddOrgMemberOpen}
        onOpenChange={setIsAddOrgMemberOpen}
        onAdded={() => orgMembers.reload()}
      />
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{describeApiError(error)}</span>
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

/** One member row: role display, and — for a manager — an inline role change and removal. */
function MemberRow({
  projectId,
  member,
  canManage,
  onChanged,
}: {
  projectId: string;
  member: ProjectMemberDto;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRoleChange(role: ProjectRole) {
    if (busy || role === member.role) return;
    setBusy(true);
    setError(null);
    try {
      await changeProjectMemberRole(projectId, member.id, role);
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeProjectMember(projectId, member.id);
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{member.user.name}</TableCell>
      <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
      <TableCell>
        <OrganizationRoleBadge organizationRole={member.user.organizationRole} />
      </TableCell>
      <TableCell>
        {canManage ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`role-${member.id}`} className="sr-only">
              Project role for {member.user.name}
            </Label>
            <Select
              id={`role-${member.id}`}
              className="h-8 w-36"
              value={member.role}
              disabled={busy}
              onChange={(event) => handleRoleChange(event.target.value as ProjectRole)}
            >
              {PROJECT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            {error && (
              <span className="max-w-xs text-xs text-destructive" role="alert">
                {error}
              </span>
            )}
          </div>
        ) : (
          <ProjectRoleBadge role={member.role} />
        )}
      </TableCell>
      {canManage && (
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRemove}
            aria-label={`Remove ${member.user.name} from this project`}
          >
            Remove
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

/** Grants an existing organization member access to this project. */
function AddMemberCard({
  projectId,
  existingMemberUserIds,
  isOrganizationOwner,
  onAdded,
  onRequestAddOrgMember,
}: {
  projectId: string;
  existingMemberUserIds: Set<string>;
  isOrganizationOwner: boolean;
  onAdded: () => void;
  onRequestAddOrgMember: () => void;
}) {
  const orgMembers = useOrganizationMembers();
  const [userId, setUserId] = React.useState("");
  const [role, setRole] = React.useState<ProjectRole>("ENGINEER");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const candidates = React.useMemo(
    () =>
      orgMembers.state.phase === "ready"
        ? orgMembers.state.data.filter((candidate) => !existingMemberUserIds.has(candidate.id))
        : [],
    [orgMembers.state, existingMemberUserIds],
  );

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || userId === "") return;

    setBusy(true);
    setError(null);
    try {
      await addProjectMember(projectId, userId, role);
      setUserId("");
      onAdded();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a member</CardTitle>
        <CardDescription>
          Grants a real member of this organization access to this project. They must already
          belong to the organization — this never reaches across a tenancy boundary.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {orgMembers.state.phase === "loading" && <LoadingState inline label="Loading organization members…" />}

        {orgMembers.state.phase === "ready" && candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Every current organization member already has access to this project.
            {isOrganizationOwner ? " You can provision a new account below." : ""}
          </p>
        )}

        {orgMembers.state.phase === "ready" && candidates.length > 0 && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-52 flex-col gap-1.5">
              <Label htmlFor="add-member-user">Organization member</Label>
              <Select
                id="add-member-user"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                disabled={busy}
              >
                <option value="">Choose a person…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="add-member-role">Role</Label>
              <Select
                id="add-member-role"
                value={role}
                onChange={(event) => setRole(event.target.value as ProjectRole)}
                disabled={busy}
              >
                {PROJECT_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" disabled={busy || userId === ""}>
              <Plus aria-hidden="true" />
              {busy ? "Adding…" : "Add to project"}
            </Button>
          </form>
        )}

        {isOrganizationOwner && (
          <div className="border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={onRequestAddOrgMember}>
              <UserPlus aria-hidden="true" />
              Provision a new organization account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
