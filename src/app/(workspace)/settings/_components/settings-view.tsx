"use client";

import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  Columns2,
  Home,
  Laptop,
  Moon,
  RectangleHorizontal,
  RotateCcw,
  Sparkles,
  Sun,
} from "lucide-react";
import { useUserPersonalization, LANDING_MODULE_OPTIONS } from "@/lib/use-user-personalization";
import type { Density } from "@/components/data-grid/data-grid-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ALWAYS_VISIBLE_HREF,
  SIMPLE_VIEW_HIDDEN,
  useNavCustomization,
} from "../../_components/nav-customization";
import { PAGE_GUIDES_HIDDEN_KEY } from "@/components/common/module-guide-panel";
import { useModuleLabel } from "../../_components/terminology-context";
import {
  findProjectModule,
  PROJECT_SECTIONS,
  type ProjectModule,
} from "../../projects/_components/project-modules";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { useLayoutDensity } from "@/lib/use-layout-density";
import { type ThemePreference, useTheme } from "@/lib/use-theme";
import { useWorkflowExperience } from "@/lib/use-workflow-experience";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "system", label: "Match system", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const DENSITY_OPTIONS: ReadonlyArray<{
  value: Density;
  label: string;
  description: string;
  icon: typeof Columns2;
}> = [
  {
    value: "comfortable",
    label: "Comfortable",
    description: "More columns, more breathing room — the default.",
    icon: Columns2,
  },
  {
    value: "compact",
    label: "Compact",
    description: "One column, tighter spacing — more fits without scrolling.",
    icon: RectangleHorizontal,
  },
];

/** The pages Simple view keeps out of the sidebar, in sidebar order. */
const SIMPLE_VIEW_MODULES = PROJECT_SECTIONS.flatMap((section) => section.modules)
  .filter((href) => SIMPLE_VIEW_HIDDEN.has(href))
  .map((href) => findProjectModule(href))
  .filter((module): module is ProjectModule => module !== undefined);

/** Every page a reader can hide, grouped the way the sidebar groups them. Command Center is left out: it can never be hidden. */
const HIDEABLE_SECTIONS = PROJECT_SECTIONS.map((section) => ({
  section,
  modules: section.modules
    .filter((href) => href !== ALWAYS_VISIBLE_HREF)
    .map((href) => findProjectModule(href))
    .filter((module): module is ProjectModule => module !== undefined),
})).filter(({ modules }) => modules.length > 0);

/**
 * Two sections, deliberately separated: everything under "Personalization"
 * is a personal, per-browser preference — not synced to the account (same
 * tradeoff `use-stored-flag.ts` and `use-theme.ts` each explain on their
 * own terms), reset to defaults on a new device. "Organization-wide" is
 * the opposite in every respect — engineering industry and terminology
 * are owner-set once and apply to everyone — so it only links out to
 * where that actually lives (the Organization page) rather than
 * duplicating that form here, where it would misleadingly read as
 * personal too.
 */
export function SettingsView({ isOwner }: { isOwner: boolean }) {
  const [theme, setTheme] = useTheme();
  const [density, setDensity] = useLayoutDensity();
  const [guidesHidden, setGuidesHidden] = useStoredFlag(PAGE_GUIDES_HIDDEN_KEY);
  const { hidden, setHidden, reset: resetNavCustomization } = useNavCustomization();
  const { isSimpleMode } = useWorkflowExperience();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Personalization</h2>
          <p className="text-sm text-muted-foreground">
            How this application looks and behaves for you specifically, in this browser.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Remembered in this browser only — sign in from another device and it starts back at
              &ldquo;Match system&rdquo; there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="inline-flex overflow-hidden rounded-md border border-input" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map((option, index) => {
                const Icon = option.icon;
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "flex h-9 items-center gap-2 px-3 text-sm font-medium transition-colors",
                      index > 0 && "border-l border-input",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
            <CardDescription>
              How densely Command Center arranges its own sections. A grid a reader has already
              set an explicit density on (any data table&apos;s own density toggle) keeps that
              choice regardless of what this becomes — this only seeds a table&apos;s density the
              first time you open it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Layout density">
              {DENSITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = density === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setDensity(option.value)}
                    className={cn(
                      "flex flex-1 items-start gap-2.5 rounded-md border p-3 text-left transition-colors",
                      isActive
                        ? "border-primary bg-accent"
                        : "border-input hover:bg-secondary/50",
                    )}
                  >
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className={cn("text-sm font-medium", isActive ? "text-accent-foreground" : "text-foreground")}>
                        {option.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleHelp className="size-4" aria-hidden="true" />
              Page guides
            </CardTitle>
            <CardDescription>
              A short &ldquo;what is this, why it matters, where to start&rdquo; at the top of each
              page. Hide a single page&apos;s guide from the page itself, or all of them here. Either
              way, &ldquo;What is this page?&rdquo; brings one back.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex w-fit items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!guidesHidden}
                onChange={(event) => setGuidesHidden(!event.target.checked)}
                className="size-4 rounded border-input"
              />
              Show a guide at the top of each page
            </label>
          </CardContent>
        </Card>

        <WorkflowExperienceSettingsCard />
        <PersonalizedLandingCard />

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Pages you use</CardTitle>
              <CardDescription>
                Untick a page you never use to hide it from the sidebar, the tabs and the jump-to
                search. Nothing is deleted — tick it again to bring it back.
              </CardDescription>
            </div>
            {hidden.size > 0 && (
              <Button variant="outline" size="sm" onClick={resetNavCustomization} className="shrink-0">
                <RotateCcw aria-hidden="true" />
                Show all
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {HIDEABLE_SECTIONS.map(({ section, modules }) => (
              <fieldset key={section.id} className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {section.step ? `Step ${section.step}: ${section.label}` : section.label}
                </legend>
                <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {modules.map((module) => (
                    <ModuleRow
                      key={module.href}
                      module={module}
                      hidden={hidden}
                      setHidden={setHidden}
                      hiddenBySimpleView={isSimpleMode && SIMPLE_VIEW_HIDDEN.has(module.href)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Organization-wide</h2>
          <p className="text-sm text-muted-foreground">
            Set once, applied to everyone in your organization — not a personal preference.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>
              Engineering industry and terminology apply to everyone in your organization, so they
              live on a shared page rather than here.
              {!isOwner && " Only an organization owner can change them."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/organization" className="text-sm text-primary hover:underline">
              Go to organization settings →
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ModuleRow({
  module,
  hidden,
  setHidden,
  hiddenBySimpleView,
}: {
  module: ProjectModule;
  hidden: ReadonlySet<string>;
  setHidden: (href: string, isHidden: boolean) => void;
  /** Simple view keeps it out of the sidebar whatever its box says. */
  hiddenBySimpleView: boolean;
}) {
  const Icon = module.icon;
  const label = useModuleLabel(module.labelKey, module.label);
  const isShown = !hidden.has(module.href);
  const id = `show-page${module.href.replace(/\//g, "-")}`;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <input
        id={id}
        type="checkbox"
        checked={isShown}
        onChange={(event) => setHidden(module.href, !event.target.checked)}
        className="size-4 shrink-0 rounded border-input"
      />
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className={cn("truncate text-sm font-medium", isShown ? "text-foreground" : "text-muted-foreground line-through")}>
          {label}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {hiddenBySimpleView ? "Hidden while Simple view is on. " : ""}
          {module.description}
        </span>
      </label>
    </div>
  );
}

/**
 * Simple view: the one "show me less" switch. It keeps the specialist tools
 * (`SIMPLE_VIEW_HIDDEN`) out of the sidebar and tabs, and keeps the
 * step-by-step guide to short summaries. Same preference the sidebar's
 * "Show all tools" / "Simple view" button flips.
 */
function WorkflowExperienceSettingsCard() {
  const { isSimpleMode, setSimpleMode } = useWorkflowExperience();
  const labels = SIMPLE_VIEW_MODULES.map((module) => module.label).join(", ");

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>Simple view</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {isSimpleMode ? "On" : "Off"}
          </Badge>
        </div>
        <CardDescription>
          Shows only the core of each step, and keeps the step-by-step guide to short summaries. Good
          for getting started; switch it off when your team needs the specialist tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3.5">
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">Use Simple view</span>
            <span className="text-xs text-muted-foreground">
              Kept out of the sidebar while it is on: {labels}. They still open from links and from
              the jump-to search (Ctrl/⌘ K).
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              role="switch"
              checked={isSimpleMode}
              onChange={(e) => setSimpleMode(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
          </span>
        </label>

        {/*
          A "Contextual Auto-Guide Co-Pilot" switch stood here. Nothing read
          it: the only references to `autoShowGuide` in the codebase were
          this control writing it and this control reading it back, so
          flipping it changed nothing anywhere. A switch that reports a
          setting the product does not have is worse than no switch, and
          guidance now appears when it is asked for, from the Help button.
        */}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">See the step-by-step guide for the page you are on.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"));
            }}
            className="gap-1.5 text-xs"
          >
            <BookOpen className="size-3.5" /> Open the guide
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonalizedLandingCard() {
  const { landingModule, setLandingModule } = useUserPersonalization();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="size-4 text-primary" aria-hidden="true" />
          Where &ldquo;Open project&rdquo; takes you
        </CardTitle>
        <CardDescription>
          Choose the page that opens when you open a project from the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Project Default Landing Module</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Default landing module">
            {LANDING_MODULE_OPTIONS.map((option) => {
              const isActive = landingModule === option.value;
              return (
                <button
                  key={option.value || "overview"}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setLandingModule(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                    isActive
                      ? "border-primary bg-accent/60"
                      : "border-input hover:bg-secondary/50",
                  )}
                >
                  <span className={cn("text-sm font-semibold flex items-center justify-between w-full", isActive ? "text-primary" : "text-foreground")}>
                    {option.label}
                    {isActive && <Badge variant="outline" className="text-[10px] py-0 border-primary text-primary">Default</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
