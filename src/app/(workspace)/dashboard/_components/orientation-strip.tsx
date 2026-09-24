import Link from "next/link";
import { ArrowRight, FileCheck, ShoppingCart, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The 3 straightforward steps of the PDLC software workflow.
 */
const STEPS = [
  {
    icon: FileCheck,
    stepNum: "1",
    title: "1. Create or Import Requirement",
    body: "Write technical specs or paste an Amazon ASIN / DigiKey part number.",
    href: "/projects",
    linkText: "Create Requirement",
  },
  {
    icon: ShoppingCart,
    stepNum: "2",
    title: "2. Link Store Part / Evidence",
    body: "Connect test logs, CAD stress calculations, or DigiKey component datasheets.",
    href: "/integrations",
    linkText: "Connect Store Part",
  },
  {
    icon: ShieldCheck,
    stepNum: "3",
    title: "3. 1-Click Sign-Off & Trace Impact",
    body: "Execute multi-custody decision sign-offs and trace downstream blast radius.",
    href: "/decisions",
    linkText: "Sign-Off & Trace",
  },
] as const;

export function OrientationStrip() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Zap className="size-4 text-primary" /> Straightforward 3-Step Workflow
        </h2>
        <span className="text-xs font-mono text-muted-foreground">SIMPLE MODE</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.title}
              className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-primary/40"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">
                    {step.stepNum}
                  </span>
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
              </div>

              <Button asChild variant="outline" size="sm" className="w-full text-xs font-semibold gap-1.5 mt-2">
                <Link href={step.href}>
                  {step.linkText}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
