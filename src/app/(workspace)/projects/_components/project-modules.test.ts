import { describe, expect, it } from "vitest";
import { MODULE_GUIDES } from "@/domain/module-guide";
import { PROGRESS_MODULES, PROGRESS_STAGE_DEFINITIONS } from "@/domain/project-progress";
import {
  moduleForPath,
  PROJECT_MODULES,
  PROJECT_SECTIONS,
  sectionForModule,
  STEP_COUNT,
} from "./project-modules";

/**
 * The navigation and the explanations of it must describe the same set of
 * pages. A module added to the sidebar without a guide would quietly be the
 * one page a newcomer cannot find their way around; a guide for a module
 * that no longer exists would be dead text.
 */
describe("project modules", () => {
  it("each have a plain-language guide, and every guide has a module", () => {
    const navigated = PROJECT_MODULES.map((module) => module.href).sort();
    const guided = Object.keys(MODULE_GUIDES).sort();

    expect(guided).toEqual(navigated);
  });

  it("include every module a project's next step can send someone to", () => {
    const hrefs = new Set(PROJECT_MODULES.map((entry) => entry.href));

    for (const stageModule of PROGRESS_MODULES) {
      expect(
        hrefs.has(`/${stageModule}`),
        `/${stageModule} is a stage destination but not in the navigation`,
      ).toBe(true);
    }
  });
});

/**
 * The sidebar lists sections; each section's pages are its tabs. Every page
 * must be reachable from exactly one section, or it is either lost or
 * shown in two places with two different "current step"s.
 */
describe("project sections", () => {
  it("put every module in exactly one section, and name nothing that isn't a module", () => {
    const placed = PROJECT_SECTIONS.flatMap((section) => section.modules).filter((href) => href !== "");

    expect([...placed].sort()).toEqual(PROJECT_MODULES.map((module) => module.href).sort());
  });

  it("number the six steps 1–6, in the same order and words as the project page's progress stages", () => {
    const steps = PROJECT_SECTIONS.filter((section) => section.step !== undefined);

    expect(STEP_COUNT).toBe(6);
    expect(steps.map((section) => section.step)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.map((section) => [section.label, section.question])).toEqual(
      PROGRESS_STAGE_DEFINITIONS.map((definition) => [definition.title, definition.question]),
    );
  });

  it("file each module under the stage its own guide says it serves", () => {
    for (const section of PROJECT_SECTIONS) {
      for (const href of section.modules) {
        if (href === "") continue;
        const guide = MODULE_GUIDES[href as keyof typeof MODULE_GUIDES];
        expect(guide.stage, `${href} is under ${section.id}`).toBe(section.stage ?? null);
      }
    }
  });

  it("send each step's link to the page its progress stage points at", () => {
    // The next-step panel sends Define to requirements, Verify to
    // verification, and so on; the sidebar step should open the same page.
    expect(PROJECT_SECTIONS.find((s) => s.stage === "DEFINE")?.modules[0]).toBe("/requirements");
    expect(PROJECT_SECTIONS.find((s) => s.stage === "DESIGN")?.modules[0]).toBe("/design-items");
    expect(PROJECT_SECTIONS.find((s) => s.stage === "VERIFY")?.modules[0]).toBe("/verification");
    expect(PROJECT_SECTIONS.find((s) => s.stage === "CONTROL")?.modules[0]).toBe("/changes");
    expect(PROJECT_SECTIONS.find((s) => s.stage === "RELEASE")?.modules[0]).toBe("/baselines");
  });
});

describe("moduleForPath", () => {
  it("finds the module from a list page, a record's own page, and a deeper page", () => {
    expect(moduleForPath("/projects/p1/requirements")).toBe("/requirements");
    expect(moduleForPath("/projects/p1/requirements/req-1")).toBe("/requirements");
    expect(moduleForPath("/projects/p1/traceability/matrix")).toBe("/traceability");
  });

  it("treats the project's own page as the Overview", () => {
    expect(moduleForPath("/projects/p1")).toBe("");
    expect(sectionForModule("")?.id).toBe("overview");
  });

  it("files supplier sub-pages with top-level paths under Suppliers", () => {
    expect(moduleForPath("/projects/p1/supplied-items/item-1")).toBe("/suppliers");
    expect(moduleForPath("/projects/p1/supplier-qualifications/q-1")).toBe("/suppliers");
  });

  it("is null outside a project", () => {
    expect(moduleForPath("/projects")).toBeNull();
    expect(moduleForPath("/dashboard")).toBeNull();
  });
});
