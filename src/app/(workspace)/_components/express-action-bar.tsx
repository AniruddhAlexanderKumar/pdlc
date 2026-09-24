"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  FileCheck,
  GitPullRequest,
  Plus,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
          className="hidden md:inline-flex h-8 items-center gap-1.5 border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <Zap className="size-3.5 fill-primary/20 text-primary" aria-hidden="true" />
          <span>Express Workflows</span>
          <ChevronDown className="size-3 text-primary/70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2 flex flex-col gap-1">
        <div className="px-2 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <Sparkles className="size-3 text-primary" /> 1-Click Fast Actions
        </div>
        <div className="h-px bg-border my-1" />

        <Link
          href={getHref("/requirements")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <FileCheck className="size-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs">New Requirement</span>
            <span className="text-[10px] text-muted-foreground truncate">Draft requirement & inspect quality</span>
          </div>
        </Link>

        <Link
          href={getHref("/decisions")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <Scale className="size-4 text-blue-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs">Log Trade Study / Decision</span>
            <span className="text-[10px] text-muted-foreground truncate">Record assumptions & alternatives</span>
          </div>
        </Link>

        <Link
          href={getHref("/risks")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <ShieldAlert className="size-4 text-amber-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs">Declare Engineering Risk</span>
            <span className="text-[10px] text-muted-foreground truncate">Register severity & mitigation</span>
          </div>
        </Link>

        <Link
          href={getHref("/changes")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <GitPullRequest className="size-4 text-purple-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs">Request Change / Impact Walk</span>
            <span className="text-[10px] text-muted-foreground truncate">Simulate change impact across graph</span>
          </div>
        </Link>

        <Link
          href={getHref("/sentinel")}
          onClick={closeMenu}
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-secondary text-foreground transition-colors"
        >
          <ShieldCheck className="size-4 text-indigo-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs">Open Decision Sentinel</span>
            <span className="text-[10px] text-muted-foreground truncate">Surveil assumption breaks & drifts</span>
          </div>
        </Link>

        <div className="h-px bg-border my-1" />

        <button
          type="button"
          onClick={() => {
            closeMenu();
            window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"));
          }}
          className="flex items-center gap-2 rounded-md p-2 hover:bg-secondary text-foreground text-xs font-medium transition-colors text-left"
        >
          <BookOpen className="size-4 text-primary shrink-0" />
          <span>Launch Step-by-Step Guide</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
