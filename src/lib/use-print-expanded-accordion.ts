"use client";

import * as React from "react";

/**
 * Keeps an `Accordion`'s normal, interactive open/closed state on screen,
 * but forces every panel open for the duration of a print.
 *
 * A CSS-only fix does not work here: Radix's Collapsible primitive (which
 * Accordion is built on) does not merely hide a closed panel's content
 * with `display: none` or the `hidden` attribute — it does not render
 * the children into the DOM at all while closed (`children: isOpen &&
 * children` in `@radix-ui/react-collapsible`). Printing "Known
 * limitations" while only one entry happens to be expanded on screen
 * would silently omit every other one from the page, which defeats the
 * point of printing a reference page. The only real fix is to actually
 * open every panel — via real state — right before the browser's print
 * pipeline runs, then restore whatever the reader had open once it's
 * done.
 */
export function usePrintExpandedAccordion(allValues: readonly string[]) {
  const [value, setValue] = React.useState<string[]>([]);
  const beforePrintValue = React.useRef<string[]>([]);

  React.useEffect(() => {
    function handleBeforePrint() {
      beforePrintValue.current = value;
      setValue([...allValues]);
    }
    function handleAfterPrint() {
      setValue(beforePrintValue.current);
    }
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [value, allValues]);

  return { value, onValueChange: setValue };
}
