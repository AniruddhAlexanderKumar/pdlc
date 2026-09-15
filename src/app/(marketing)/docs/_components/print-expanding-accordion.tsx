"use client";

import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { usePrintExpandedAccordion } from "@/lib/use-print-expanded-accordion";

export interface AccordionEntry {
  id: string;
  /** A plain string, or already-built JSX (Troubleshooting's error-code-plus-message trigger) — never a function. */
  title: ReactNode;
  body: ReactNode;
}

/**
 * The accordion pattern Known limitations, Troubleshooting, and Concepts'
 * "More, briefly" section all use — extracted once so all three get the
 * print-all-panels behavior (see `use-print-expanded-accordion.ts`)
 * rather than some having it and others quietly not. A small client
 * component specifically so the pages that render it (all three export
 * `metadata`) can stay real Server Components — only the interactive
 * accordion itself needs the browser.
 *
 * `title` takes `ReactNode`, not a `renderTrigger` callback — a function
 * prop from a Server Component page into this Client Component is not
 * serializable across that boundary and fails at runtime ("Functions
 * cannot be passed directly to Client Components"), found exactly that
 * way here once, not assumed safe. A Server Component *can* construct a
 * richer trigger as JSX and hand it over as data instead — Troubleshooting
 * builds its two-line "code plus message" trigger this way, in its own
 * item list, rather than this component executing a callback to produce it.
 */
export function PrintExpandingAccordion({
  items,
  className,
}: {
  items: AccordionEntry[];
  className?: string;
}) {
  const allIds = items.map((item) => item.id);
  const { value, onValueChange } = usePrintExpandedAccordion(allIds);

  return (
    <Accordion type="multiple" value={value} onValueChange={onValueChange} className={className}>
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger>{item.title}</AccordionTrigger>
          <AccordionContent>{item.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
