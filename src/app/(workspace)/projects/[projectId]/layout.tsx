import type { ReactNode } from "react";
import { ProjectSectionTabs } from "../_components/project-section-tabs";

/**
 * Every page inside a project gets the tab bar for the sidebar section it
 * belongs to. A layout, not something each page renders, so a new page in
 * a section gets its tabs by being listed in `PROJECT_SECTIONS` — nothing
 * to remember per page, and the tabs stay put while the page below them
 * loads.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ProjectSectionTabs />
      {children}
    </>
  );
}
