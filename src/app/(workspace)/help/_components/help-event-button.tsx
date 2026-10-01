"use client";

import type * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A button that opens one of the workspace's overlays (the step-by-step
 * guide, the onboarding tour) by the same window event the Help menu uses.
 *
 * Its own client component because `HelpView` is a Server Component: a
 * click handler written inline there cannot cross to the browser, and
 * Next refused to render the Help page at all ("Event handlers cannot be
 * passed to Client Component props").
 */
export function HelpEventButton({
  event,
  variant,
  children,
}: {
  event: string;
  variant?: ButtonProps["variant"];
  children: React.ReactNode;
}) {
  return (
    <Button size="sm" variant={variant} className="gap-1.5" onClick={() => window.dispatchEvent(new Event(event))}>
      {children}
    </Button>
  );
}
