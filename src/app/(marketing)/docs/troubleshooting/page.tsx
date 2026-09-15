import type { Metadata } from "next";
import { DocsPage } from "../_components/docs-page";
import { PrintExpandingAccordion } from "../_components/print-expanding-accordion";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description: "Real errors, their real causes — sourced from the application's own error types.",
};

/**
 * Built as data (id/title/body) rather than through a shared
 * `renderTrigger` callback — see print-expanding-accordion.tsx's own
 * comment on why a function prop can't cross the Server→Client Component
 * boundary this page and that component sit on either side of. Each
 * `title` here is already the full two-line trigger JSX; a plain string
 * title would look identical to a regular Accordion item, this way and
 * the callback way both, so there is no loss from not sharing the
 * rendering logic itself.
 */
function errorTitle(code: string, message: string) {
  return (
    <span className="flex flex-col gap-0.5 text-left">
      <span className="font-mono text-xs text-muted-foreground">{code}</span>
      <span>{message}</span>
    </span>
  );
}

const ERRORS = [
  {
    id: "not-found",
    title: errorTitle("404 · NOT_FOUND", '"The requested resource could not be found"'),
    body: "Either the object genuinely doesn't exist, or it belongs to a project or organization you're not authorized to see. Both cases return the identical response deliberately — an id belonging to someone else's data reads exactly like an id that was never issued, so a client can never distinguish \"doesn't exist\" from \"exists, but not yours to see.\"",
  },
  {
    id: "forbidden",
    title: errorTitle("403 · FORBIDDEN", '"You do not have permission to perform this action"'),
    body: "You can see this project (it didn't 404), but your role on it doesn't permit the specific action — approving a requirement as a Viewer, for instance. Check your project role; only a project Manager can change it.",
  },
  {
    id: "conflict",
    title: errorTitle("409 · CONFLICT", '"The request conflicts with the current state"'),
    body: "Most often a concurrent edit: someone else's transition committed first, or the object is no longer in the status your request assumed it was in. Reload the object and try again with its current state — this is the optimistic-concurrency guard working as designed, not a bug.",
  },
  {
    id: "validation",
    title: errorTitle("400 · VALIDATION_ERROR", '"The request payload failed validation"'),
    body: "A field is missing, the wrong type, or an unrecognized extra field was sent. Every request schema in this product is a Zod strictObject — an unexpected field (a client-chosen id, a status, a timestamp) is rejected outright rather than silently dropped, which is a deliberate mass-assignment defense, not an overly strict form.",
  },
  {
    id: "unauthorized",
    title: errorTitle("401 · UNAUTHORIZED", '"Authentication is required to access this resource"'),
    body: "Your session has expired or you're not signed in. Sessions expire server-side against a stored timestamp regardless of what the cookie itself says — sign in again.",
  },
  {
    id: "traversal-refused",
    title: errorTitle("Traversal refused, not truncated", "A traceability or impact request comes back refused instead of a result"),
    body: "You asked for more than the real hard caps allow (depth, node count, or edge count — see the simulator on the Concepts page). The fix is to narrow the request, not to retry the same one — it will refuse identically every time, on purpose.",
  },
];

export default function TroubleshootingPage() {
  return (
    <DocsPage
      title="Troubleshooting"
      description="Every entry below is a real error type this application actually throws (src/server/errors.ts), not a hypothetical."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/troubleshooting/page.tsx"
    >
      <PrintExpandingAccordion items={ERRORS} className="w-full" />

      <p className="text-sm text-muted-foreground">
        Anything else returns a generic 500 with no internal detail — deliberately: a raw database error,
        a stack trace, or a connection string never reaches the client. The server logs it in full,
        tagged with a request id echoed back as the <code className="font-mono">x-request-id</code> response
        header, for exactly this situation — include that id if you&apos;re reporting the problem.
      </p>
    </DocsPage>
  );
}
