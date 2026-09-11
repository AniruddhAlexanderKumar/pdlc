import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type Project, createProjectInputSchema, projectSchema } from "@/domain";

describe("project representation", () => {
  it("is a plain object, constructible without a database or Prisma", () => {
    const project: Project = {
      id: "clh1project0000000000000",
      organizationId: "clh1org000000000000000000",
      name: "Upper Stage Propulsion",
      description: null,
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };

    const parsed = projectSchema.parse(project);

    expect(parsed).toEqual(project);
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a project with an unknown status", () => {
    const result = projectSchema.safeParse({
      id: "clh1project0000000000000",
      organizationId: "clh1org000000000000000000",
      name: "Upper Stage Propulsion",
      description: null,
      status: "DELETED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("requires an organization on create — projects are always tenant-scoped", () => {
    const result = createProjectInputSchema.safeParse({ name: "Upper Stage Propulsion" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("organizationId"))).toBe(true);
  });

  it("rejects a blank project name", () => {
    const result = createProjectInputSchema.safeParse({
      organizationId: "clh1org000000000000000000",
      name: "   ",
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Architectural guardrail rather than a behavioural test: the domain layer is
 * only useful as a stable contract if it cannot quietly acquire a dependency
 * on generated persistence types.
 */
describe("domain/persistence separation", () => {
  async function collectDomainSources(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectDomainSources(entryPath);
        return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [entryPath] : [];
      }),
    );
    return files.flat();
  }

  it("contains no imports of Prisma or the generated client", async () => {
    const domainDirectory = path.join(process.cwd(), "src", "domain");
    const sources = await collectDomainSources(domainDirectory);

    expect(sources.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const source of sources) {
      const contents = await readFile(source, "utf8");
      if (/from\s+["'](@prisma\/|@\/generated\/|\.\.\/generated\/)/.test(contents)) {
        offenders.push(path.relative(process.cwd(), source));
      }
    }

    expect(offenders).toEqual([]);
  });
});
