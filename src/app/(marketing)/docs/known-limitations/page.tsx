import type { Metadata } from "next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Known limitations",
  description: "Stated plainly, sourced from the same documents engineering reads — not a marketing omission.",
};

const LIMITATIONS = [
  {
    id: "rate-limiting",
    title: "Rate limiting is single-instance",
    body: "The failed sign-in throttle is an in-process, in-memory counter (10 attempts per 15 minutes per email). It does not survive a restart and is not shared across instances. A multi-instance deployment needs a real rate-limiting layer in front of the sign-in endpoint — a reverse proxy, a WAF, or a shared store — which this codebase does not provide.",
  },
  {
    id: "evidence-storage",
    title: "No file or binary evidence storage",
    body: "Evidence is stored as metadata and reference records only — a document id, a path, a URL an engineer typed. The system never stores, fetches, or verifies file contents. This is the current, disclosed shape of the product, not a storage bug awaiting a fix.",
  },
  {
    id: "migrations",
    title: "Forward-only migrations",
    body: "There is no down-migration path. A migration failure or an unwanted schema change is recovered by restoring a backup or authoring a new forward migration, never an automatic rollback.",
  },
  {
    id: "csp",
    title: "CSP requires 'unsafe-inline' for two directives",
    body: "script-src and style-src both need it — Next.js's App Router injects its hydration payload as an inline script with no nonce wired through, and Radix UI (a real dependency) sets inline style attributes for portalled positioning. Every other directive is as strict as the application allows, including frame-ancestors 'none'.",
  },
  {
    id: "backups",
    title: "No built-in backup automation",
    body: "The application implements no scheduling or automation for backups. The pg_dump/pg_restore procedure is documented; running it on a schedule and verifying restores is an operator responsibility.",
  },
  {
    id: "certifications",
    title: "No compliance certification held",
    body: "DO-178C, AS9100, ISO 26262, SOC 2 — none are held. Aerospace terminology in this product describes what it helps an operator track about their own process, not a claim about this software's own certification status.",
  },
];

export default function KnownLimitationsPage() {
  return (
    <DocsPage
      title="Known limitations"
      description="Every entry here is copied from SECURITY.md or DEPLOYMENT.md's own disclosure, not softened for a public page."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/known-limitations/page.tsx"
    >
      <Accordion type="single" collapsible className="w-full">
        {LIMITATIONS.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger>{item.title}</AccordionTrigger>
            <AccordionContent>{item.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </DocsPage>
  );
}
