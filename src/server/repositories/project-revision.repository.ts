import { createHash } from "node:crypto";
import { type DbClient, prisma } from "@/lib/db";

/**
 * A deterministic digest of a project's engineering state.
 *
 * Used to tell whether a stored analysis still describes the current graph. The
 * approach is deliberately the blunt one: for every table an analysis could
 * have read, take the row count and the newest timestamp within this project,
 * and hash the lot.
 *
 * **It is conservative on purpose.** An edit anywhere in the project changes the
 * digest, so an analysis can be marked stale by a change that could not
 * possibly have affected it. That is the safe direction to be wrong in: a
 * false "stale" costs one re-run, while a false "current" would present an
 * out-of-date impact assessment as though it still held. Being cheap matters
 * too — a per-finding fingerprint would mean re-walking the graph just to
 * answer "is this still valid?", which is as expensive as re-running it.
 *
 * Counts as well as timestamps, so a deletion moves the digest even though it
 * leaves no newer row behind.
 */

interface Aggregate {
  _count: number;
  _max: { updatedAt?: Date | null; createdAt?: Date | null };
}

function stamp(name: string, aggregate: Aggregate): string {
  const newest = aggregate._max.updatedAt ?? aggregate._max.createdAt ?? null;
  return `${name}:${aggregate._count}:${newest ? newest.toISOString() : "-"}`;
}

/**
 * Hashes the project's artifact and relationship state.
 *
 * Artifact tables are filtered by their own `projectId`; relationship tables
 * through the artifact that owns them, because a link row has no project column
 * of its own. Decision memory children reach the project through their decision
 * for the same reason.
 */
export async function computeProjectFingerprint(
  projectId: string,
  client: DbClient = prisma,
): Promise<string> {
  const byUpdated = { _count: true as const, _max: { updatedAt: true } as const };
  const byCreated = { _count: true as const, _max: { createdAt: true } as const };

  const [
    project,
    needs,
    requirements,
    decisions,
    alternatives,
    assumptions,
    expectations,
    designItems,
    interfaces,
    verifications,
    risks,
    issues,
    changeRequests,
    evidence,
    approvals,
    needRequirementLinks,
    requirementLinks,
    requirementDesignLinks,
    requirementVerificationLinks,
    requirementDecisionLinks,
    decisionDesignLinks,
    decisionRiskLinks,
    decisionIssueLinks,
    designItemLinks,
    designInterfaceLinks,
    riskRequirementLinks,
    riskDesignLinks,
    issueRequirementLinks,
    issueDesignLinks,
    evidenceLinks,
    changeImpacts,
  ] = await Promise.all([
    client.project.aggregate({ where: { id: projectId }, ...byUpdated }),
    client.stakeholderNeed.aggregate({ where: { projectId }, ...byUpdated }),
    client.requirement.aggregate({ where: { projectId }, ...byUpdated }),
    client.engineeringDecision.aggregate({ where: { projectId }, ...byUpdated }),
    client.decisionAlternative.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byUpdated,
    }),
    client.decisionAssumption.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byUpdated,
    }),
    client.decisionExpectation.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byUpdated,
    }),
    client.designItem.aggregate({ where: { projectId }, ...byUpdated }),
    client.interfaceDefinition.aggregate({ where: { projectId }, ...byUpdated }),
    client.verificationActivity.aggregate({ where: { projectId }, ...byUpdated }),
    client.risk.aggregate({ where: { projectId }, ...byUpdated }),
    client.issue.aggregate({ where: { projectId }, ...byUpdated }),
    client.changeRequest.aggregate({ where: { projectId }, ...byUpdated }),
    client.evidence.aggregate({ where: { projectId }, ...byUpdated }),
    // Approvals are immutable once recorded, so creation time is their revision.
    client.approval.aggregate({ where: { projectId }, ...byCreated }),
    client.needRequirementLink.aggregate({
      where: { stakeholderNeed: { projectId } },
      ...byCreated,
    }),
    client.requirementLink.aggregate({
      where: { sourceRequirement: { projectId } },
      ...byCreated,
    }),
    client.requirementDesignLink.aggregate({
      where: { requirement: { projectId } },
      ...byCreated,
    }),
    client.requirementVerificationLink.aggregate({
      where: { requirement: { projectId } },
      ...byCreated,
    }),
    client.requirementDecisionLink.aggregate({
      where: { requirement: { projectId } },
      ...byCreated,
    }),
    client.decisionDesignLink.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byCreated,
    }),
    client.decisionRiskLink.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byCreated,
    }),
    client.decisionIssueLink.aggregate({
      where: { engineeringDecision: { projectId } },
      ...byCreated,
    }),
    client.designItemLink.aggregate({
      where: { sourceDesignItem: { projectId } },
      ...byCreated,
    }),
    client.designInterfaceLink.aggregate({
      where: { designItem: { projectId } },
      ...byCreated,
    }),
    client.riskRequirementLink.aggregate({ where: { risk: { projectId } }, ...byCreated }),
    client.riskDesignLink.aggregate({ where: { risk: { projectId } }, ...byCreated }),
    client.issueRequirementLink.aggregate({ where: { issue: { projectId } }, ...byCreated }),
    client.issueDesignLink.aggregate({ where: { issue: { projectId } }, ...byCreated }),
    client.evidenceLink.aggregate({ where: { evidence: { projectId } }, ...byCreated }),
    client.changeRequestImpact.aggregate({
      where: { changeRequest: { projectId } },
      ...byCreated,
    }),
  ]);

  // Sorted by name so the digest never depends on the order of the reads above.
  const parts = [
    stamp("project", project),
    stamp("stakeholderNeed", needs),
    stamp("requirement", requirements),
    stamp("engineeringDecision", decisions),
    stamp("decisionAlternative", alternatives),
    stamp("decisionAssumption", assumptions),
    stamp("decisionExpectation", expectations),
    stamp("designItem", designItems),
    stamp("interfaceDefinition", interfaces),
    stamp("verificationActivity", verifications),
    stamp("risk", risks),
    stamp("issue", issues),
    stamp("changeRequest", changeRequests),
    stamp("evidence", evidence),
    stamp("approval", approvals),
    stamp("needRequirementLink", needRequirementLinks),
    stamp("requirementLink", requirementLinks),
    stamp("requirementDesignLink", requirementDesignLinks),
    stamp("requirementVerificationLink", requirementVerificationLinks),
    stamp("requirementDecisionLink", requirementDecisionLinks),
    stamp("decisionDesignLink", decisionDesignLinks),
    stamp("decisionRiskLink", decisionRiskLinks),
    stamp("decisionIssueLink", decisionIssueLinks),
    stamp("designItemLink", designItemLinks),
    stamp("designInterfaceLink", designInterfaceLinks),
    stamp("riskRequirementLink", riskRequirementLinks),
    stamp("riskDesignLink", riskDesignLinks),
    stamp("issueRequirementLink", issueRequirementLinks),
    stamp("issueDesignLink", issueDesignLinks),
    stamp("evidenceLink", evidenceLinks),
    stamp("changeRequestImpact", changeImpacts),
  ].sort();

  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
