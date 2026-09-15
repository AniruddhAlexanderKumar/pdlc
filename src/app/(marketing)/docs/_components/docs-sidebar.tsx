"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { DOCS_NAV } from "./docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="flex w-full flex-col gap-4 lg:w-56 lg:shrink-0">
      <CommandPalette />

      <ul className="flex flex-col gap-0.5">
        {DOCS_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
