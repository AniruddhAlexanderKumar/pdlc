import { describe, expect, it } from "vitest";
import { MODULE_GUIDES } from "@/domain/module-guide";
import { PROGRESS_MODULES } from "@/domain/project-progress";
import { PROJECT_MODULES } from "./project-modules";

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
