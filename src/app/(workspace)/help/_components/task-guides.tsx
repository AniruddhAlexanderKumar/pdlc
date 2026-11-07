import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface TaskGuide {
  id: string;
  question: string;
  steps: string[];
  /** An honest caveat, where the flow has one someone would otherwise hit as a surprise. */
  note?: string;
}

/**
 * "How do I actually do X", in the order of the clicks.
 *
 * Every step below names a control that really exists, with the label it
 * really has — checked against the components that render them
 * (`requirements-view.tsx`'s "New requirement", `members-view.tsx`'s "Add
 * a member", `verification-evidence-panel.tsx`'s "Attach evidence", and
 * so on) rather than written from memory of how such a product usually
 * works. If a label changes, these go stale and should be corrected; that
 * is the cost of telling someone exactly what to click instead of
 * describing the general idea and leaving them to find it.
 */
const GUIDES: readonly TaskGuide[] = [
  {
    id: "add-person",
    question: "How do I add someone to my organization?",
    steps: [
      "Open Organization from the top bar (the organization name, left of the breadcrumbs).",
      "Stay on the People tab — it opens there.",
      "Choose Add a person, then enter their name, email, and a first password.",
    ],
    note:
      "Only an organization owner can do this, and it creates a working account immediately — there is no invitation email to wait for, so you pass the first password to them yourself. Being in the organization grants no project access on its own.",
  },
  {
    id: "grant-project-access",
    question: "How do I give someone access to a project?",
    steps: [
      "Open the project, then Members from the project overview page.",
      "In the Add a member card, pick the person and the role to grant them.",
      "Save — they can reach the project immediately.",
    ],
    note:
      "They have to already be in your organization first (see the question above). This never reaches across organizations.",
  },
  {
    id: "first-requirement",
    question: "How do I write my first requirement?",
    steps: [
      "Open a project, then Requirements in the sidebar.",
      "Choose New requirement.",
      "Give it a statement and the rationale behind it, then save.",
    ],
    note:
      "The rationale is the part that pays off later: it is what Engineering History and every impact analysis show back to you when someone asks why this exists.",
  },
  {
    id: "change-impact",
    question: "How do I find out what a change would affect?",
    steps: [
      "Open the project's Changes module and open the change request.",
      "Declare what the change touches, if you have not already.",
      "Choose Run impact analysis.",
    ],
    note:
      "The result classifies every object it reaches (direct, downstream, cross-domain, context) and shows the real path it followed to get there. It never scores the change, and it never runs on its own — the answer you see is the one someone asked for, at the moment they asked.",
  },
  {
    id: "verify-requirement",
    question: "How do I show a requirement has been met?",
    steps: [
      "Open Verification in the project sidebar and open the activity that covers the requirement.",
      "Record the method and the outcome.",
      "Under Attach evidence, attach the evidence record that backs it up.",
    ],
    note:
      "Evidence is attached, not uploaded — this product stores a reference to a document, never the file itself. Create the evidence record in the Evidence module first if it does not exist yet.",
  },
  {
    id: "why-is-this",
    question: "How do I find out why something is the way it is?",
    steps: [
      "Open the object — a requirement, a decision, a risk.",
      "Use Trace to follow its real relationships outward, hop by hop.",
      "Use Engineering History for the chronological record of every change and transition on it.",
    ],
    note:
      "History is reconstructed at read time from what was already recorded. There is nothing to switch on first, and nothing that has to have been logged separately.",
  },
] as const;

export function TaskGuides() {
  return (
    <Accordion type="multiple" className="w-full">
      {GUIDES.map((guide) => (
        <AccordionItem key={guide.id} value={guide.id}>
          <AccordionTrigger>{guide.question}</AccordionTrigger>
          <AccordionContent>
            <ol className="flex list-decimal flex-col gap-1.5 pl-4">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {guide.note && (
              <p className="mt-2.5 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                {guide.note}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
      <AccordionItem value="something-else">
        <AccordionTrigger>My question isn&apos;t here</AccordionTrigger>
        <AccordionContent>
          The rest of this page explains the ideas behind the product rather than the clicks — and
          the{" "}
          <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
            public documentation
          </Link>{" "}
          goes further, including the known limitations this product states plainly rather than
          leaves you to discover.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
