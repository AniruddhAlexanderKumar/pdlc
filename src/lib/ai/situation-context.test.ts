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
    expect(analysis.contextBanner).toContain("Command Center Dashboard");
    expect(analysis.answer).toContain("Key Focus");
    expect(analysis.recommendedActions.length).toBeGreaterThan(0);
  });

  it("generates targeted analysis for sentinel query", () => {
    const ctx = extractSituationContext("/sentinel");
    const analysis = generateSituationalAnalysis(ctx, "How does sentinel work?");
    expect(analysis.answer).toContain("Decision Sentinel");
    expect(analysis.answer).toContain("Surveillance Target Triggering");
  });
});
