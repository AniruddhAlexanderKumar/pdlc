import Link from "next/link";
import { FolderGit2, GitBranch, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shell } from "@/components/common/shell";

const PILLARS = [
  {
    title: "Requirements",
    description: "Author, structure, and trace requirements across the program.",
    icon: ListChecks,
  },
  {
    title: "Architecture",
    description: "Model system and component architecture alongside requirements.",
    icon: FolderGit2,
  },
  {
    title: "Verification",
    description: "Track verification methods and evidence against requirements.",
    icon: ShieldCheck,
  },
  {
    title: "Changes",
    description: "Manage change requests and their downstream impact.",
    icon: GitBranch,
  },
] as const;

export default function MarketingHomePage() {
  return (
    <Shell className="flex flex-col gap-16 py-16">
      <section className="flex flex-col items-start gap-4">
        <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Engineering foundation
        </span>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          A product development platform built for aerospace rigor.
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          PDLC Platform is the application shell and technical foundation for managing
          requirements, architecture, verification, and change across an aerospace program.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/dashboard">Enter workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Card key={pillar.title}>
              <CardHeader>
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <CardTitle>{pillar.title}</CardTitle>
                <CardDescription>{pillar.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>
    </Shell>
  );
}
