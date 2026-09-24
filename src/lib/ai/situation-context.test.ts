import { describe, expect, it } from "vitest";
import { extractSituationContext, generateSituationalAnalysis } from "./situation-context";

describe("situation-context", () => {
  it("extracts context for requirements route", () => {
    const ctx = extractSituationContext("/projects/prj_123/requirements", "ENGINEER");
    expect(ctx.moduleName).toBe("Requirements & Stakeholder Needs");
    expect(ctx.moduleCategory).toBe("Define");
    expect(ctx.primaryDomainEntity).toBe("Requirement");
    expect(ctx.projectId).toBe("prj_123");
    expect(ctx.userRole).toBe("ENGINEER");
    expect(ctx.suggestedPrompts).toHaveLength(3);
  });

  it("extracts context for decisions route", () => {
    const ctx = extractSituationContext("/projects/prj_456/decisions", "MANAGER");
    expect(ctx.moduleName).toBe("Engineering Decisions & Architecture");
    expect(ctx.moduleCategory).toBe("Decide");
    expect(ctx.primaryDomainEntity).toBe("EngineeringDecision");
    expect(ctx.userRole).toBe("MANAGER");
  });

  it("extracts context for sentinel route", () => {
    const ctx = extractSituationContext("/sentinel", "REVIEWER");
    expect(ctx.moduleName).toBe("Decision Sentinel");
    expect(ctx.moduleCategory).toBe("Understand");
    expect(ctx.primaryDomainEntity).toBe("SentinelEvent");
  });

  it("generates situational analysis for overview query", () => {
    const ctx = extractSituationContext("/dashboard", "OWNER");
    const analysis = generateSituationalAnalysis(ctx, "Analyze this page");
    expect(analysis.contextBanner).toContain("Dashboard");
    expect(analysis.answer).toContain("Key Focus");
    expect(analysis.recommendedActions.length).toBeGreaterThan(0);
  });

  /**
   * `/dashboard` and `/command-center` were one branch, both answering
   * "Command Center Dashboard". They are different pages: the first lists
   * the projects you can reach, the second aggregates attention inside one
   * project. Describing a project-scoped view to someone who has not opened
   * a project yet is the kind of wrong that makes help feel untrustworthy,
   * and this test previously asserted it.
   */
  it("tells the personal dashboard apart from a project's Command Center", () => {
    const dashboard = extractSituationContext("/dashboard", "OWNER");
    const commandCentre = extractSituationContext("/projects/p1/command-center", "OWNER");

    expect(dashboard.moduleName).toBe("Dashboard");
    expect(commandCentre.moduleName).toBe("Command Center");
    expect(commandCentre.projectId).toBe("p1");
    expect(dashboard.projectId).toBeUndefined();
  });

  /** "Health" is a word this product refuses; it should not reappear in help copy. */
  it("describes what a page holds without rating it", () => {
    for (const route of ["/dashboard", "/projects/p1/command-center", "/projects/p1/requirements"]) {
      const ctx = extractSituationContext(route, "OWNER");
      const text = `${ctx.moduleName} ${ctx.summary}`.toLowerCase();
      for (const forbidden of ["health", "score", "rating", "%"]) {
        expect(text, `${route} says "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("generates targeted analysis for sentinel query", () => {
    const ctx = extractSituationContext("/sentinel");
    const analysis = generateSituationalAnalysis(ctx, "How does sentinel work?");
    expect(analysis.answer).toContain("Decision Sentinel");
    expect(analysis.answer).toContain("Surveillance Target Triggering");
  });
});
