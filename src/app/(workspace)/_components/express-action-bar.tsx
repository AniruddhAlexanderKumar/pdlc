"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  FileCheck,
  GitPullRequest,
  Scale,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TestTube2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENT_PROJECT_PATTERN } from "./sidebar";
import { useUserPersonalization } from "@/lib/use-user-personalization";

export function ExpressActionBar() {
  const pathname = usePathname();
  const { showExpressBar } = useUserPersonalization();
  const currentProjectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;
  const [open, setOpen] = React.useState(false);

  if (!showExpressBar) return null;

  const getHref = (path: string) => {
    return currentProjectId ? `/projects/${currentProjectId}${path}` : `/projects`;
  };

  const closeMenu = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="inline-flex h-8 items-center gap-1.5 border-primary/30 bg-primary/5 text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <Zap className="size-3.5 fill-primary/20 text-primary" aria-hidden="true" />
          <span>Express Workflows</span>
          <ChevronDown className="size-3 text-primary/70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2.5 flex flex-col gap-1 shadow-lg">
        <div className="px-2 py-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground font-bold">
          <span className="flex items-center gap-1.5 text-primary">
            <Sparkles className="size-3.5 text-primary" /> 1-Click Fast Actions
          </span>
          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-extrabold">SIMPLE MODE</span>
        </div>
        <div className="h-px bg-border my-1" />

        <Link
          href={getHref("/requirements")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <FileCheck className="size-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs">1. Create Requirement</span>
            <span className="text-[10px] text-muted-foreground truncate">Draft technical spec &amp; inspect quality</span>
          </div>
        </Link>

        <Link
          href="/integrations"
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <ShoppingCart className="size-4 text-amber-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs">2. Connect Store Part / Spec</span>
            <span className="text-[10px] text-muted-foreground truncate">Sync Amazon, DigiKey, Mouser or McMaster</span>
          </div>
        </Link>

        <Link
          href={getHref("/evidence")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <TestTube2 className="size-4 text-blue-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs">3. Attach Verification Evidence</span>
            <span className="text-[10px] text-muted-foreground truncate">Link hot fire logs or CAD calculations</span>
          </div>
        </Link>

        <Link
          href={getHref("/decisions")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <Scale className="size-4 text-indigo-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs">4. Log Trade Study / Decision</span>
            <span className="text-[10px] text-muted-foreground truncate">Record baseline choice &amp; sign-off gate</span>
          </div>
        </Link>

        <Link
          href={getHref("/changes")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <GitPullRequest className="size-4 text-purple-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs">5. Simulate Blast Radius Impact</span>
            <span className="text-[10px] text-muted-foreground truncate">Walk downstream change dependencies</span>
          </div>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
