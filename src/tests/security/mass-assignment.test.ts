// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addProjectMemberRequestSchema,
  changeProjectMemberRoleRequestSchema,
} from "@/domain/access-control";
import { createCertificationProgramRequestSchema } from "@/domain/certification";
import { createEvidenceRequestSchema } from "@/domain/evidence";
import {
  assignRequirementOwnerRequestSchema,
  createRequirementRequestSchema,
  updateRequirementRequestSchema,
} from "@/domain/requirement";
import { signUpRequestSchema } from "@/domain/auth";

/**
 * Mass assignment: can a client smuggle a server-controlled field —
 * `id`, `projectId`, `organizationId`, `actorId`, `status`, `createdAt`,
 * a role — through a request body a real endpoint actually accepts?
 *
 * The defense is `z.strictObject` on every client-facing request schema
 * (confirmed by inspection across every `src/domain/*.ts` file — 23 of 29
 * use it at least once, and every "*RequestSchema" this sweep did not find
 * an exception in), which rejects an unrecognized key outright rather than
 * silently stripping it. This exercises that boundary directly, against
 * the real schemas every route/service actually calls through
 * `parseOrThrow`, on a representative module from each of: core artifacts,
 * evidence, certification, and membership/role administration — not an
 * exhaustive sweep of all ~130 request schemas, which would just be
 * re-asserting the same `.strictObject` property found by inspection.
 */

describe("mass assignment — server-controlled fields are rejected, not silently dropped", () => {
  it("a requirement cannot be created with a client-chosen id, projectId or lifecycle status", () => {
    const attempt = {
      identifier: "REQ-001",
      title: "Chamber pressure",
      statement: "The system shall withstand 300 bar.",
      // Everything below is an attack, not a legitimate field of this request.
      id: "req-attacker-chosen-id",
      projectId: "someone-elses-project",
      organizationId: "someone-elses-org",
      status: "BASELINED", // real requirements start DRAFT; this schema accepts no status at all
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };

    const result = createRequirementRequestSchema.safeParse(attempt);
    expect(result.success).toBe(false);
  });

  it("a requirement's project association and identifier cannot be changed through a content update", () => {
    const attempt = {
      title: "Revised title",
      projectId: "attacker-controlled-project",
      identifier: "REQ-999",
      status: "APPROVED",
    };

    const result = updateRequirementRequestSchema.safeParse(attempt);
    expect(result.success).toBe(false);

    // The legitimate subset alone is accepted — proving the rejection above
    // is about the extra fields, not the whole shape being unusable.
    expect(updateRequirementRequestSchema.safeParse({ title: "Revised title" }).success).toBe(true);
  });

  it("owner assignment accepts only ownerId — not a role, not a status, not who assigned it", () => {
    const attempt = { ownerId: "user1aaaaaaaaaaaaaaaaaaa", assignedById: "attacker", role: "MANAGER" };

    expect(assignRequirementOwnerRequestSchema.safeParse(attempt).success).toBe(false);
    expect(
      assignRequirementOwnerRequestSchema.safeParse({ ownerId: "user1aaaaaaaaaaaaaaaaaaa" }).success,
    ).toBe(true);
  });

  it("evidence cannot be created already VALIDATED, or pre-linked to an evidenceId of the attacker's choosing", () => {
    const attempt = {
      identifier: "EV-001",
      title: "Vibration test log",
      evidenceType: "TEST_RESULT",
      sourceReference: "s3://bucket/log.csv",
      status: "VALIDATED", // real evidence always starts DRAFT — see evidence.service.ts
      id: "ev-attacker-chosen-id",
      validatedById: "attacker-claims-to-be-a-reviewer",
    };

    expect(createEvidenceRequestSchema.safeParse(attempt).success).toBe(false);
  });

  it("a certification program cannot be created pre-activated or owned by a project outside the caller's", () => {
    const attempt = {
      identifier: "CERT-001",
      name: "Avionics certification",
      status: "ACTIVE", // real programs always start DRAFT
      projectId: "attacker-chosen-project",
    };

    expect(createCertificationProgramRequestSchema.safeParse(attempt).success).toBe(false);
  });

  it("registration cannot self-grant an organization role or an arbitrary organizationId", () => {
    const attempt = {
      email: "attacker@example.test",
      password: "a genuinely long enough password",
      name: "Attacker",
      organizationName: "Shell Org",
      organizationRole: "OWNER", // real registration always makes the caller OWNER of a *new* org, never lets them name the role
      organizationId: "existing-org-attacker-does-not-belong-to",
      role: "ADMIN",
    };

    expect(signUpRequestSchema.safeParse(attempt).success).toBe(false);
  });

  it("adding a project member accepts only userId and role — not a project id the caller supplies", () => {
    const attempt = { userId: "user1aaaaaaaaaaaaaaaaaaa", role: "MANAGER", projectId: "attacker-chosen" };
    expect(addProjectMemberRequestSchema.safeParse(attempt).success).toBe(false);

    const legitimate = { userId: "user1aaaaaaaaaaaaaaaaaaa", role: "MANAGER" };
    expect(addProjectMemberRequestSchema.safeParse(legitimate).success).toBe(true);
  });

  it("changing a member's role accepts only the role — the membership row itself is a route parameter, not a body field", () => {
    expect(
      changeProjectMemberRoleRequestSchema.safeParse({ role: "MANAGER", membershipId: "attacker-chosen" })
        .success,
    ).toBe(false);
    expect(changeProjectMemberRoleRequestSchema.safeParse({ role: "MANAGER" }).success).toBe(true);
  });

  it("an unrecognized role name is rejected by the enum itself, not merely by strictness", () => {
    // Defense in depth: even a client that sends *only* a role field cannot
    // invent a role this system does not define.
    expect(addProjectMemberRequestSchema.safeParse({ userId: "user1aaaaaaaaaaaaaaaaaaa", role: "SUPERADMIN" }).success).toBe(
      false,
    );
  });
});
