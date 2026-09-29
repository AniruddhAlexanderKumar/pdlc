"use client";

import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  Columns2,
  Eye,
  EyeOff,
  Home,
  Laptop,
  ListTree,
  Moon,
  RectangleHorizontal,
  RotateCcw,
  Sparkles,
  Star,
  Sun,
  Wand2,
} from "lucide-react";
import { useUserPersonalization, LANDING_MODULE_OPTIONS } from "@/lib/use-user-personalization";
import type { Density } from "@/components/data-grid/data-grid-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "../../_components/nav-customization";
import { SIMPLIFY_STORAGE_KEY } from "../../_components/sidebar";
import { PAGE_GUIDES_HIDDEN_KEY } from "@/components/common/module-guide-panel";
import { useModuleLabel } from "../../_components/terminology-context";
import {
  MODULE_GROUPS,
  PROJECT_MODULES,
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

/** Every customizable module, grouped the same way the sidebar itself groups them, plus an "Other" bucket for the two that have no permanent sidebar residency by default (Suppliers, Members) — pinning from here is the only way either ever appears in the sidebar at all. Command Center is excluded everywhere: it can be neither hidden nor pinned. */
const CUSTOMIZABLE_MODULES = PROJECT_MODULES.filter((module) => module.href !== ALWAYS_VISIBLE_HREF);
const OTHER_MODULES = CUSTOMIZABLE_MODULES.filter((module) => module.group === null);

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
  const [simplified, setSimplified] = useStoredFlag(SIMPLIFY_STORAGE_KEY);
  const [guidesHidden, setGuidesHidden] = useStoredFlag(PAGE_GUIDES_HIDDEN_KEY);
  const { hidden, pinned, setHidden, setPinned, reset: resetNavCustomization } = useNavCustomization();
  const hasCustomization = hidden.size > 0 || pinned.size > 0;

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
              <ListTree className="size-4" aria-hidden="true" />
              Navigation
            </CardTitle>
            <CardDescription>
              The same &ldquo;Simplify&rdquo; control the sidebar has. It hides the less-used pages
              and keeps everything a project&apos;s next step can send you to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex w-fit items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={simplified}
                onChange={(event) => setSimplified(event.target.checked)}
                className="size-4 rounded border-input"
              />
              Simplify project navigation
            </label>
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
              <CardTitle>Modules</CardTitle>
              <CardDescription>
                Remove a module from every sidebar it would otherwise appear in, or pin one — even
                Suppliers or Members, which have no permanent sidebar spot by default — so it always
                shows there, immune to Simplify. A module is never both at once.
              </CardDescription>
            </div>
            {hasCustomization && (
              <Button variant="outline" size="sm" onClick={resetNavCustomization} className="shrink-0">
                <RotateCcw aria-hidden="true" />
                Reset
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {MODULE_GROUPS.map((group) => {
              const members = CUSTOMIZABLE_MODULES.filter((module) => module.group === group.id);
              if (members.length === 0) return null;
              return (
                <ModuleGroupList
                  key={group.id}
                  label={group.label}
                  modules={members}
                  hidden={hidden}
                  pinned={pinned}
                  setHidden={setHidden}
                  setPinned={setPinned}
                />
              );
            })}
            <ModuleGroupList
              label="Other — not shown by default"
              modules={OTHER_MODULES}
              hidden={hidden}
              pinned={pinned}
              setHidden={setHidden}
              setPinned={setPinned}
            />
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

interface NavCustomizationControls {
  hidden: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  setHidden: (href: string, isHidden: boolean) => void;
  setPinned: (href: string, isPinned: boolean) => void;
}

function ModuleGroupList({
  label,
  modules,
  ...controls
}: { label: string; modules: readonly ProjectModule[] } & NavCustomizationControls) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {modules.map((module) => (
          <ModuleRow key={module.href} module={module} {...controls} />
        ))}
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  hidden,
  pinned,
  setHidden,
  setPinned,
}: { module: ProjectModule } & NavCustomizationControls) {
  const Icon = module.icon;
  const label = useModuleLabel(module.labelKey, module.label);
  const isHidden = hidden.has(module.href);
  const isPinned = pinned.has(module.href);

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm font-medium", isHidden ? "text-muted-foreground line-through" : "text-foreground")}>
          {label}
        </span>
        <span className="truncate text-xs text-muted-foreground">{module.description}</span>
      </div>
      {isPinned && (
        <Badge variant="outline" className="shrink-0">
          Pinned
        </Badge>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setPinned(module.href, !isPinned)}
          aria-pressed={isPinned}
          aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
          title={isPinned ? "Unpin" : "Pin to sidebar"}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isPinned ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Star className={cn("size-4", isPinned && "fill-current")} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setHidden(module.href, !isHidden)}
          aria-pressed={isHidden}
          aria-label={isHidden ? `Show ${label}` : `Remove ${label}`}
          title={isHidden ? "Show in sidebar" : "Remove from sidebar"}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isHidden ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isHidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function WorkflowExperienceSettingsCard() {
  const { isSimpleMode, setSimpleMode } = useWorkflowExperience();

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>Workflow & Guide Experience</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            Personal Preference
          </Badge>
        </div>
        <CardDescription>
          Customize how simple and guided your engineering workflows appear in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5 bg-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Simplified Workflow Mode
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Defaults step-by-step guides to plain-English 3-bullet summaries and streamlined single-action controls.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center shrink-0">
              <input
                type="checkbox"
                checked={isSimpleMode}
                onChange={(e) => setSimpleMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        {/*
          A "Contextual Auto-Guide Co-Pilot" switch stood here. Nothing read
          it: the only references to `autoShowGuide` in the codebase were
          this control writing it and this control reading it back, so
          flipping it changed nothing anywhere. A switch that reports a
          setting the product does not have is worse than no switch, and
          guidance now appears when it is asked for, from the Help button.
        */}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Want to test the interactive step-by-step guide now?</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"));
            }}
            className="gap-1.5 text-xs"
          >
            <BookOpen className="size-3.5" /> Launch Guide Drawer
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
