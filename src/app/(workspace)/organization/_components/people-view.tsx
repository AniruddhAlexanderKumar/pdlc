"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, UserPlus, Users } from "lucide-react";
import { organizationRoleLabel } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type OrganizationPersonDto,
  addOrganizationMember,
  useOrganizationPeople,
} from "@/lib/api/organization-membership";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";

/**
 * Everyone in the organization, in one place.
 *
 * Before this page existed, "who else is in my organization?" had no
 * answer anywhere in the product, and the only way to add a person at all
 * was to open some project, go to its Members tab, and use a dialog buried
 * there — which reads as "add someone to this project" when it actually
 * creates an account in the whole organization. That is the wrong place
 * for it, so the same action lives here too, where its real scope is
 * obvious.
 *
 * Adding a person provisions a real account directly: this product has no
 * invitation-email flow (it is self-hosted and assumes no mail
 * infrastructure — see `organization-membership.service.ts`), so an owner
 * sets the first password and passes it on. Said plainly in the dialog
 * rather than left for someone to discover.
 */
export function PeopleView({ isOwner }: { isOwner: boolean }) {
  const { state, reload } = useOrganizationPeople();
  const [isAddOpen, setIsAddOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everyone with an account in this organization. Being here does not grant access to any
          project on its own — project access is granted per project, on that project&apos;s own
          Members page.
        </p>
        {isOwner && (
          <Button onClick={() => setIsAddOpen(true)} className="shrink-0">
            <UserPlus aria-hidden="true" />
            Add a person
          </Button>
        )}
      </div>

      {state.phase === "loading" && <LoadingState label="Loading people…" />}

      {state.phase === "error" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(state.error)}</span>
          </p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.phase === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title="No one here yet"
            description="Add the first person to this organization."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {state.data.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </ul>
        ))}

      {isOwner && (
        <AddPersonDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          onAdded={() => {
            setIsAddOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * An owner's access is never described by their membership count.
 *
 * An organization owner reaches every project in the organization with no
 * per-project membership row at all: `getProjectRole` in
 * `authorization.service.ts` looks for a membership row first and, finding
 * none, falls back to `isOrganizationOwner` and returns an implicit
 * `MANAGER`. An owner's row count is therefore usually zero, and rendering
 * that as "No project access" is not merely terse, it is the opposite of
 * what is true — caught by looking at the real page with real seed data,
 * where the owner sat at the top of the list claiming to have no access to
 * anything.
 */
function describeAccess(person: OrganizationPersonDto): string {
  if (person.organizationRole === "OWNER") return "All projects";
  if (person.projectCount === 0) return "No project access";
  return `${person.projectCount} project${person.projectCount === 1 ? "" : "s"}`;
}

function PersonRow({ person }: { person: OrganizationPersonDto }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{person.name}</span>
        <span className="truncate text-xs text-muted-foreground">{person.email}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className="text-xs text-muted-foreground"
          title={
            person.organizationRole === "OWNER"
              ? "An organization owner reaches every project without needing to be added to it."
              : undefined
          }
        >
          {describeAccess(person)}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Joined <span className="font-mono">{formatIsoDate(person.joinedAt)}</span>
        </span>
        <Badge variant={person.organizationRole === "OWNER" ? "default" : "outline"}>
          {organizationRoleLabel(person.organizationRole)}
        </Badge>
      </div>
    </li>
  );
}

function AddPersonDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setName("");
      setEmail("");
      setPassword("");
      setError(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await addOrganizationMember({ name: name.trim(), email: email.trim(), password });
      setName("");
      setEmail("");
      setPassword("");
      onAdded();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a person</DialogTitle>
            <DialogDescription>
              This creates a real account immediately — there is no invitation email. Set a first
              password here and pass it to them directly; they can sign in with it straight away.
              They join as a Member, and get access to no project until someone grants it.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-name">Name</Label>
              <Input
                id="person-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-email">Email</Label>
              <Input
                id="person-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSaving}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="person-password">First password</Label>
              <Input
                id="person-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSaving}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim() || !email.trim() || !password}>
              {isSaving ? "Adding…" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
