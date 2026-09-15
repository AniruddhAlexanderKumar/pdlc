import type { Metadata } from "next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description: "Real errors, their real causes — sourced from the application's own error types.",
};

const ERRORS = [
  {
    id: "not-found",
    code: "404 · NOT_FOUND",
    title: "\"The requested resource could not be found\"",
    body: "Either the object genuinely doesn't exist, or it belongs to a project or organization you're not authorized to see. Both cases return the identical response deliberately — an id belonging to someone else's data reads exactly like an id that was never issued, so a client can never distinguish \"doesn't exist\" from \"exists, but not yours to see.\"",
  },
  {
    id: "forbidden",
    code: "403 · FORBIDDEN",
    title: "\"You do not have permission to perform this action\"",
    body: "You can see this project (it didn't 404), but your role on it doesn't permit the specific action — approving a requirement as a Viewer, for instance. Check your project role; only a project Manager can change it.",
  },
  {
    id: "conflict",
    code: "409 · CONFLICT",
    title: "\"The request conflicts with the current state\"",
    body: "Most often a concurrent edit: someone else's transition committed first, or the object is no longer in the status your request assumed it was in. Reload the object and try again with its current state — this is the optimistic-concurrency guard working as designed, not a bug.",
  },
  {
    id: "validation",
    code: "400 · VALIDATION_ERROR",
    title: "\"The request payload failed validation\"",
    body: "A field is missing, the wrong type, or an unrecognized extra field was sent. Every request schema in this product is a Zod strictObject — an unexpected field (a client-chosen id, a status, a timestamp) is rejected outright rather than silently dropped, which is a deliberate mass-assignment defense, not an overly strict form.",
  },
  {
    id: "unauthorized",
    code: "401 · UNAUTHORIZED",
    title: "\"Authentication is required to access this resource\"",
    body: "Your session has expired or you're not signed in. Sessions expire server-side against a stored timestamp regardless of what the cookie itself says — sign in again.",
  },
  {
    id: "traversal-refused",
    code: "Traversal refused, not truncated",
    title: "A traceability or impact request comes back refused instead of a result",
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
      <Accordion type="single" collapsible className="w-full">
        {ERRORS.map((error) => (
          <AccordionItem key={error.id} value={error.id}>
            <AccordionTrigger>
              <span className="flex flex-col gap-0.5 text-left">
                <span className="font-mono text-xs text-muted-foreground">{error.code}</span>
                <span>{error.title}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>{error.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="text-sm text-muted-foreground">
        Anything else returns a generic 500 with no internal detail — deliberately: a raw database error,
        a stack trace, or a connection string never reaches the client. The server logs it in full,
        tagged with a request id echoed back as the <code className="font-mono">x-request-id</code> response
        header, for exactly this situation — include that id if you&apos;re reporting the problem.
      </p>
    </DocsPage>
  );
}
