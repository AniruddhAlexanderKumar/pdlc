import type { Metadata } from "next";
import { GRAPH_EDGE_TYPES, GRAPH_LIMITS, GRAPH_NODE_TYPES } from "@/domain";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocsPage } from "../_components/docs-page";
import { EdgeRegistryExplorer } from "../_components/edge-registry-explorer";
import { LifecycleExplorer } from "../_components/lifecycle-explorer";

export const metadata: Metadata = {
  title: "Concepts",
  description: "The graph, determinism, and why the product carries no scores — with two live explorers over real data.",
};

export default function ConceptsPage() {
  return (
    <DocsPage
      title="Concepts"
      description="The handful of ideas everything else in this product is built from."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/concepts/page.tsx"
    >
      <section className="flex flex-col gap-3">
        <h2>One real graph</h2>
        <p>
          Every relationship in this product — a requirement allocated to a design item, a risk affecting a
          requirement, a piece of evidence supporting a decision — is a real foreign key in a real table,
          not a note in a spreadsheet. The registry below is not a diagram drawn to illustrate that; it reads{" "}
          <code className="font-mono">GRAPH_EDGE_DEFINITIONS</code> directly, the exact same registry the
          traversal engine reads. {GRAPH_NODE_TYPES.length} node types, {GRAPH_EDGE_TYPES.length} edge types —
          pick one and see its real edges.
        </p>
        <EdgeRegistryExplorer />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Determinism, and what it guarantees</h2>
        <p>
          A lifecycle transition is either allowed or it is not — never partially, never with an exception
          for who is asking. The table below is the real transition table for six artifact types, the same
          object every service imports to decide whether a requested status change is legal.
        </p>
        <LifecycleExplorer />
        <p>
          The same discipline extends to traversal: a request to walk the graph outward from an object is
          capped at {GRAPH_LIMITS.maxMaxDepth} hops, {GRAPH_LIMITS.maxMaxNodes} objects, or{" "}
          {GRAPH_LIMITS.maxMaxEdges} relationships. Asking for more is refused outright with a stated reason
          — never silently clamped and returned as if it were complete.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Why there are no scores</h2>
        <p>
          No finding in this product carries a severity number, a confidence percentage, or a color standing
          in for one. An engine that reasons over the graph reports a classification (direct, downstream,
          cross-domain, context) and the real path it followed to reach that conclusion, hop by hop. A
          number beyond that would be invented — the graph does not contain one, so none is manufactured to
          fill the gap.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>More, briefly</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="baselines">
            <AccordionTrigger>Baselines, revisions, and supersession</AccordionTrigger>
            <AccordionContent>
              An engineering baseline is a snapshot of a set of objects at a point in time — what was
              approved, and exactly what state it was in. A baseline is never edited after activation; a
              later change either drifts from it (detected by comparison, not silently) or the baseline is
              explicitly superseded by a new one, which never deletes the old one.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="lessons">
            <AccordionTrigger>A lesson is not a requirement</AccordionTrigger>
            <AccordionContent>
              A requirement is a binding statement this program commits to satisfy. A lesson or a constraint
              carried across projects is context an engineer should see, not an obligation the system
              enforces on a different program&apos;s behalf — the two are kept structurally distinct so
              neither is mistaken for the other.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="append-only">
            <AccordionTrigger>Append-only records and deletion</AccordionTrigger>
            <AccordionContent>
              The audit log and every persisted assessment (technical readiness, verification readiness,
              drift, impact analysis, certification review) are never edited or deleted in place — a
              re-evaluation appends a new row, and a superseded one points at what replaced it and stays
              exactly as it was. This is enforced by the service layer having no update or delete path for
              these tables, not by a database permission alone.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </DocsPage>
  );
}
