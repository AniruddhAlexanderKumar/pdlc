import { GRAPH_LIMITS } from "@/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Static reference content — no data fetch, no client state. Every specific
 * number or behavior described here is read from the real domain constants
 * (`GRAPH_LIMITS`) or is a plain statement of how the code actually works,
 * checked against it while writing this page. If a limit or a rule changes,
 * this page should be revisited rather than left describing a system that
 * no longer exists.
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
            own, so it is always exactly as current as the modules it reads from.
          </p>
          <p>
            <strong className="text-foreground">Simplify</strong> (near the top of the sidebar,
            once you are inside a project) collapses the six groups down to the handful of
            modules used daily. It is a per-browser display preference, remembered on this
            device only — turning it off always brings everything back.
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
            says so, rather than silently returning an incomplete answer as if it were whole. The
            limits themselves are fixed on purpose: a traversal request can ask for up to{" "}
            <span className="font-mono text-foreground">{GRAPH_LIMITS.maxMaxDepth}</span> hops,{" "}
            <span className="font-mono text-foreground">{GRAPH_LIMITS.maxMaxNodes}</span> objects,
            or <span className="font-mono text-foreground">{GRAPH_LIMITS.maxMaxEdges}</span>{" "}
            relationships — asking for more than that is rejected outright, never quietly
            clamped.
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
    </div>
  );
}
