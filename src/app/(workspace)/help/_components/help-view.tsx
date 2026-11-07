import Link from "next/link";
import { BookOpen, Compass, Sparkles } from "lucide-react";
import { GRAPH_EDGE_TYPES, GRAPH_NODE_TYPES } from "@/domain";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EdgeRegistryExplorer } from "@/components/domain-explorers/edge-registry-explorer";
import { LifecycleExplorer } from "@/components/domain-explorers/lifecycle-explorer";
import { TraversalLimitsSimulator } from "@/components/domain-explorers/traversal-limits-simulator";
import { HelpEventButton } from "./help-event-button";
import { TaskGuides } from "./task-guides";

const FAQ: ReadonlyArray<{ id: string; question: string; answer: string }> = [
  {
    id: "hide-a-page",
    question: "Can I hide a page I never use?",
    answer:
      "Yes — untick it under Settings → Pages you use. It disappears from the sidebar, from its step's tabs, and from the jump-to search, until you tick it again. Nothing is deleted: the records on that page are untouched, and anyone else on the project still sees it. Command Center is the one page you can't hide, because it's where everything that needs attention is gathered.",
  },
  {
    id: "jump-to",
    question: "Is there a faster way to get to a module than clicking through the sidebar?",
    answer:
      "Press Ctrl K (or ⌘K) from anywhere in the app, or click the search box in the top bar. It jumps to any page, finds records by identifier or by their text, and starts new ones: type “new” (or the kind of record, like “risk”) and pick “New risk” to land on Risks with its form already open. Whatever you've removed from your sidebar is absent here too; whatever you've renamed (see the next question) shows up under your organization's own word for it.",
  },
  {
    id: "renaming",
    question: "Can we call a Risk something else, like \"Hazard\"?",
    answer:
      "An organization owner can rename any of fourteen core nouns on the Organization page — free text, applied to the sidebar and to that module's own page title everywhere in the product. It does not change any stored data, any API field name, or any computation: renaming \"Risk\" to \"Hazard\" changes what a link says, never what the risk register actually is. Nothing is auto-applied from an industry preset — an organization always types its own word, whichever of the fifteen engineering industries it works in.",
  },
  {
    id: "personal-vs-org",
    question: "Why does my Command Center look different from a teammate's?",
    answer:
      "Theme, which pages you've hidden, and which Command Center tab you land on are all personal, per-browser preferences — remembered on this device, not synced to your account or shared with anyone else on the project. Sign in from another device and they start back at their defaults. Organization terminology and industry are the exception: an owner sets them once, and they apply to everyone.",
  },
  {
    id: "no-scores",
    question: "Why is there no risk score, health percentage, or readiness rating anywhere?",
    answer:
      "Because no engine in this product computes one. A finding gets a real classification (direct, downstream, cross-domain, context) and, where relevant, a status — never a number standing in for a judgment nobody actually made. Inventing a score would be easier to build and worse to trust; this product doesn't do it, on any page, for any object.",
  },
  {
    id: "traversal-refusal",
    question: "Why did my traceability or impact request come back refused instead of a result?",
    answer:
      "You asked for more than the real hard caps allow — try the simulator in \"Try it live\" below. The fix is to narrow the request, not to retry the identical one; it refuses identically every time, on purpose, rather than silently returning a partial answer as if it were complete.",
  },
];

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "Ctrl K", action: "Open the jump-to command palette — search, go to any page, or start a new record" },
  { keys: "↑ / ↓", action: "Move through command palette or search results" },
  { keys: "Enter", action: "Go to the highlighted result" },
  { keys: "Esc", action: "Close the command palette, a dialog, or a sheet" },
];

/**
 * Four tabs instead of one long scroll — someone stuck on a task, someone
 * new who wants the concepts, someone who wants to poke at the real engine,
 * and someone with a specific question all used to compete for the same
 * page in the same order. "Get started" is the default because it is what
 * most visits are actually for; the others are one click away, not a
 * scroll away.
 *
 * Every specific number or behavior described here is read from the real
 * domain constants (`GRAPH_LIMITS`, `GRAPH_NODE_TYPES`, `GRAPH_EDGE_TYPES`)
 * or is a plain statement of how the code actually works, checked against
 * it while writing this page. The three explorers in "Try it live" are the
 * same components the public docs use — not a screenshot or a second copy
 * kept in sync by hand, the real registries and transition tables,
 * browsable from inside the product itself.
 */
export function HelpView() {
  return (
    <Tabs defaultValue="start" className="w-full">
      <TabsList>
        <TabsTrigger value="start">Get started</TabsTrigger>
        <TabsTrigger value="concepts">How it works</TabsTrigger>
        <TabsTrigger value="explore">Try it live</TabsTrigger>
        <TabsTrigger value="faq">FAQ</TabsTrigger>
      </TabsList>

      <TabsContent value="start" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Common tasks</CardTitle>
            <CardDescription>
              The clicks, in order, for the things people actually open this page to do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaskGuides />
          </CardContent>
        </Card>

        <Card className="border-primary/40 bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="size-5 text-primary" />
                <CardTitle>Step-by-Step Guide & Onboarding Tour</CardTitle>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Sparkles className="size-3" /> Guided help
              </span>
            </div>
            <CardDescription>
              Master PDLC Platform workflows with interactive click-by-click walkthroughs and practice
              sandboxes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <HelpEventButton event="pdlc:open-step-by-step-guide">
                <BookOpen className="size-4" />
                Open Step-by-Step Guide
              </HelpEventButton>
              <HelpEventButton event="pdlc:open-onboarding-tour" variant="outline">
                <Compass className="size-4 text-primary" />
                Launch Onboarding Tour
              </HelpEventButton>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/docs/step-by-step-guide">Read Full Step Guide Page</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keyboard shortcuts</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-border">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-sm text-muted-foreground">{shortcut.action}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {shortcut.keys.split(" / ").map((combo) => (
                      <kbd
                        key={combo}
                        className="rounded-xs border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                      >
                        {combo}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="concepts" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>What this is</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              A product-development control system for regulated and complex engineering — aerospace,
              automotive, medical devices, energy, and more: requirements, decisions, verification, risk,
              supplier, change, certification and configuration data on one real graph, with a few
              deterministic engines reasoning over it.
            </p>
            <p>
              The claim underneath all of it is narrow and specific: <strong className="text-foreground">the
              system remembers why</strong>, and when something changes, it tells you what that
              actually affects — never a guess, never a score, never something inferred quietly on
              your behalf.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Finding your way around</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Inside a project, the sidebar is the work itself, in order — six numbered steps:{" "}
              <strong className="text-foreground">Define</strong> what you&apos;re building,{" "}
              <strong className="text-foreground">Design</strong> its parts,{" "}
              <strong className="text-foreground">Decide</strong> and record why,{" "}
              <strong className="text-foreground">Verify</strong> it works,{" "}
              <strong className="text-foreground">Control change</strong>, then{" "}
              <strong className="text-foreground">Review &amp; release</strong>. Work down it from
              the top.
            </p>
            <p>
              Each step can hold more than one page — Verify has checks and the evidence behind
              them, for example. Those pages are <strong className="text-foreground">tabs</strong>{" "}
              along the top of the step, and the same bar says which step you&apos;re on and links
              to the next one.
            </p>
            <p>
              <strong className="text-foreground">Command Center</strong> gathers everything that
              needs someone&apos;s attention across the whole project. It computes nothing of its
              own, so it is always exactly as current as the pages it reads from.
            </p>
            <p>
              A <strong className="text-foreground">Trace</strong> button on an object&apos;s detail
              page opens it directly in Traceability, at that object, in one click — not limited to
              the handful of relationship types that object&apos;s own page shows inline.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reading a Change Impact analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              An impact analysis walks the real engineering graph outward from a change
              request&apos;s <em>declared</em> scope. Every object it reaches gets a classification —
              direct, downstream, cross-domain, or context — and a full path back to where the
              analysis started, hop by hop, with the real relationship type of every hop.
            </p>
            <p>
              <strong className="text-foreground">There is no score.</strong> Not a 1–10 rating, not
              a percentage, not a color standing in for a number. A classification and a real graph
              path are what the engine actually knows; a number beyond that would be invented, so
              none appears — anywhere, on any finding.
            </p>
            <p>
              When a traversal hits a real limit (depth, node count, or edge count) it stops and
              says so, rather than silently returning an incomplete answer as if it were whole. Try
              pushing past them in the <strong className="text-foreground">Try it live</strong> tab.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision Sentinel</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Sentinel never runs on its own — detection is an explicit action. When it finds that
              something changed <em>and</em> that change is actually referenced by another
              engineering analysis&apos; stored basis, it opens a surveillance target naming both: what
              changed, and why that specific analysis might need a fresh look. An unrelated change
              never opens a target — that rule is enforced, not just claimed.
            </p>
            <p>
              Acknowledging a target records that someone has seen it; it does not mean the
              underlying question is settled. Only Resolve (with a real note) or a newer signal
              superseding it actually closes a target out.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engineering History</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              History is not a separate log you have to remember to check — it has no table of its
              own and writes nothing. It reconstructs, at read time, everything already recorded
              about an object: every change, every status transition, every assessment, in order.
              The point of opening it on an object is to answer &quot;why is this the way it is,&quot;
              not to browse a timeline for its own sake.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What this system will not do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <li>— Invent a severity score, a confidence percentage, or a readiness rating out of thin air.</li>
              <li>— Silently truncate a result and present it as complete.</li>
              <li>— Approve, reject, or rewrite anything on your behalf.</li>
              <li>— Send your engineering data anywhere outside the database you provisioned.</li>
            </ul>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="explore" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Browse the real graph</CardTitle>
            <CardDescription>
              {GRAPH_NODE_TYPES.length} node types, {GRAPH_EDGE_TYPES.length} edge types — pick one
              and see its actual registered relationships, read live from the same registry the
              traversal engine reads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EdgeRegistryExplorer />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How status transitions work</CardTitle>
            <CardDescription>
              Every arrow below is a transition the real service actually allows; every absence is
              one it actually refuses — the same table `RequirementService`, `RiskService`, and the
              rest check on every real transition request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LifecycleExplorer />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Traversal limits</CardTitle>
            <CardDescription>
              Every graph traversal has a real, enforced cap on depth, nodes and edges. Move a
              slider past one to see the exact refusal the real API gives — never a silent
              truncation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TraversalLimitsSimulator />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="faq" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Frequently asked questions</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple">
              {FAQ.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
