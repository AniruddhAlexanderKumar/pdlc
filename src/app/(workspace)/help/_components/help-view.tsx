import { GRAPH_EDGE_TYPES, GRAPH_NODE_TYPES } from "@/domain";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EdgeRegistryExplorer } from "@/components/domain-explorers/edge-registry-explorer";
import { LifecycleExplorer } from "@/components/domain-explorers/lifecycle-explorer";
import { TraversalLimitsSimulator } from "@/components/domain-explorers/traversal-limits-simulator";

const FAQ: ReadonlyArray<{ id: string; question: string; answer: string }> = [
  {
    id: "simplify-vs-remove",
    question: "What's the difference between \"Simplify\" and removing a module?",
    answer:
      "Simplify is a single switch that collapses every group down to daily-tier modules — a blunt, all-or-nothing view. Removing a module (Settings → Modules) is permanent per module until you bring it back: it disappears from the sidebar, the outside-project picker, and the jump-to command palette alike, whether Simplify is on or off. Pinning is the opposite of removing — it keeps a module visible even under Simplify, and is the only way an occasional module like Suppliers or Members gets sidebar residency at all by default.",
  },
  {
    id: "jump-to",
    question: "Is there a faster way to get to a module than clicking through the sidebar?",
    answer:
      "Press Ctrl K (or ⌘K) from anywhere in the app, or click the search icon in the top bar. It searches navigation destinations only — modules, Settings, Organization — never engineering data itself, since there is no full-text search index for that. Whatever you've removed from your sidebar is absent here too; whatever you've renamed (see the next question) shows up under your organization's own word for it.",
  },
  {
    id: "renaming",
    question: "Can we call a Risk something else, like \"Hazard\"?",
    answer:
      "An organization owner can rename any of fourteen core nouns on the Organization page — free text, applied to the sidebar and to that module's own page title everywhere in the product. It does not change any stored data, any API field name, or any computation: renaming \"Risk\" to \"Hazard\" changes what a link says, never what the risk register actually is. Nothing is auto-applied from an industry preset — an organization always types its own word.",
  },
  {
    id: "personal-vs-org",
    question: "Why does my Command Center look different from a teammate's?",
    answer:
      "Theme, Simplify, which modules you've removed or pinned, and which Command Center sections you've hidden are all personal, per-browser preferences — remembered on this device, not synced to your account or shared with anyone else on the project. Sign in from another device and they start back at their defaults. Organization terminology is the one exception: an owner sets it once, and it applies to everyone.",
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
      "You asked for more than the real hard caps allow — try the simulator above. The fix is to narrow the request, not to retry the identical one; it refuses identically every time, on purpose, rather than silently returning a partial answer as if it were complete.",
  },
];

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: "Ctrl K", action: "Open the jump-to command palette, from anywhere" },
  { keys: "↑ / ↓", action: "Move through command palette or search results" },
  { keys: "Enter", action: "Go to the highlighted result" },
  { keys: "Esc", action: "Close the command palette, a dialog, or a sheet" },
];

/**
 * Every specific number or behavior described here is read from the real
 * domain constants (`GRAPH_LIMITS`, `GRAPH_NODE_TYPES`, `GRAPH_EDGE_TYPES`)
 * or is a plain statement of how the code actually works, checked against
 * it while writing this page. The three explorers below are the same
 * components the public docs use — not a screenshot or a second copy kept
 * in sync by hand, the real registries and transition tables, browsable
 * from inside the product itself.
 */
export function HelpView() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>What this is</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            An aerospace product-development control system: requirements, decisions,
            verification, risk, supplier, change, certification and configuration data on one
            real graph, with a few deterministic engines reasoning over it.
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
            Inside a project, the sidebar is grouped by what you are trying to do, not by which
            table a record lives in: <strong className="text-foreground">Understand</strong> what
            changed, <strong className="text-foreground">Define</strong> what&apos;s required,{" "}
            <strong className="text-foreground">Decide</strong> and record why,{" "}
            <strong className="text-foreground">Prove</strong> it, manage{" "}
            <strong className="text-foreground">Change</strong>, and{" "}
            <strong className="text-foreground">Certify</strong>.
          </p>
          <p>
            <strong className="text-foreground">Command Center</strong> is where you land — it
            composes what needs attention across the whole project and computes nothing of its
            own, so it is always exactly as current as the modules it reads from. Its own
            &quot;Customize layout&quot; control lets you remove sections you don&apos;t use, per
            project.
          </p>
          <p>
            <strong className="text-foreground">Simplify</strong>,{" "}
            <strong className="text-foreground">removing</strong> a module, and{" "}
            <strong className="text-foreground">pinning</strong> one are three related but
            different sidebar preferences — see the first question below for exactly how they
            differ. All three, plus theme and Command Center layout, live on the{" "}
            <strong className="text-foreground">Settings</strong> page.
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
            says so, rather than silently returning an incomplete answer as if it were whole. The
            limits themselves are fixed on purpose — try pushing past them below.
          </p>
          <TraversalLimitsSimulator />
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
    </div>
  );
}
