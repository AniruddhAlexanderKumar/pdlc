import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  FileText,
  GitPullRequest,
  Lightbulb,
  Lock,
  Scale,
  Server,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveShowcase } from "./_components/interactive-showcase";
import { InteractiveWorkflowStepper } from "./_components/interactive-workflow-stepper";

const RECORDS = [
  {
    number: "01",
    title: "Stakeholder need",
    description: "Begin with what someone actually needs, in words your team can return to.",
    icon: Lightbulb,
  },
  {
    number: "02",
    title: "Requirement",
    description: "Turn a need into a clear, verifiable statement of what the product must do.",
    icon: FileText,
  },
  {
    number: "03",
    title: "Design item",
    description: "Give every part of the system a place, and link it to the requirements it meets.",
    icon: Boxes,
  },
  {
    number: "04",
    title: "Decision",
    description: "Keep the alternatives, assumptions, and reasoning behind what you chose.",
    icon: Scale,
  },
  {
    number: "05",
    title: "Evidence",
    description: "Connect a requirement to the test, analysis, or inspection that proves it.",
    icon: TestTube2,
  },
  {
    number: "06",
    title: "Change request",
    description: "Understand what a proposed change touches before the work begins.",
    icon: GitPullRequest,
  },
];

export default function LandingPage() {
  return (
    <div className="marketing-theme relative overflow-hidden text-[#334139]">
      <section className="relative border-b border-[#dcd8cc] px-5 pb-20 pt-24 sm:px-8 sm:pb-28 sm:pt-36">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-3xl">
              <p className="mb-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#72806e]">
                <span className="h-px w-8 bg-[#a66e54]" />A calmer way to build complex things
              </p>
              <h1 className="font-serif text-5xl font-normal leading-[1.06] tracking-[-0.045em] text-[#29382f] sm:text-7xl lg:text-[5.5rem]">
                Make room for
                <br />
                <span className="italic text-[#7b866d]">the whole picture.</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-[#647067] sm:text-lg">
                The Morningstar Solution is a Product Development Life Cycle platform for hardware
                and software teams. Keep requirements, design, decisions, verification, evidence,
                and change connected in one thoughtful workspace.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-[#465b4d] px-7 text-sm font-medium text-[#fffdf8] shadow-sm transition-colors hover:bg-[#34473b]"
                >
                  <Link href="/sign-up" className="flex items-center gap-2">
                    Start a project <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-[#536354] transition-colors hover:bg-[#e9e7dc]"
                >
                  See how it works <ArrowDown className="size-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-7 text-xs tracking-wide text-[#7b847a]">
                Self-hosted · Your PostgreSQL · Your records stay yours
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -right-4 -top-5 h-24 w-24 rounded-full bg-[#e8d8c8]/70 blur-2xl" />
              <div className="absolute -bottom-5 -left-5 h-28 w-28 rounded-full bg-[#dce2d2]/80 blur-2xl" />
              <div className="relative rounded-[2rem] border border-[#d9d4c7] bg-[#fbfaf6]/90 p-6 shadow-[0_24px_70px_-48px_rgba(47,60,49,0.42)] sm:p-8">
                <div className="flex items-center justify-between border-b border-[#e6e1d6] pb-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#899080]">
                      One project
                    </p>
                    <p className="mt-1 font-serif text-2xl text-[#334139]">Many connected parts</p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-full bg-[#edf0e7] text-[#62745f]">
                    <Boxes className="size-5" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-3 py-6">
                  {[
                    ["Need", "A clear reason to begin", "bg-[#e9dfce] text-[#8e6e4a]"],
                    ["Requirement", "A promise you can verify", "bg-[#e1e9de] text-[#55705c]"],
                    ["Evidence", "A result you can return to", "bg-[#eee2dc] text-[#966d59]"],
                  ].map(([label, detail, color]) => (
                    <div
                      key={label}
                      className="flex items-center gap-4 rounded-2xl border border-[#e8e4da] bg-[#fffefa] p-4"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${color}`}
                      >
                        {label === "Need" ? "01" : label === "Requirement" ? "02" : "03"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#3d4b40]">{label}</p>
                        <p className="mt-0.5 text-xs text-[#81877c]">{detail}</p>
                      </div>
                      <span className="ml-auto h-px w-7 bg-[#c4c9ba]" />
                    </div>
                  ))}
                </div>
                <p className="border-t border-[#e6e1d6] pt-5 text-xs leading-5 text-[#7a8378]">
                  Real links make the relationships visible. No invented scores, no hidden
                  assumptions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a06f55]">
                A place for the details
              </p>
              <h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight tracking-[-0.03em] text-[#2f3d33] sm:text-5xl">
                Every decision has a thread.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[#68736a] md:justify-self-end">
              The work of making a product is connected. Keep the needs, choices, parts, checks, and
              changes in relationship—so the reasoning behind the result remains close at hand.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RECORDS.map(({ number, title, description, icon: Icon }) => (
              <article
                key={number}
                className="group rounded-3xl border border-[#dedace] bg-[#fbfaf6]/80 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#bac2b4] hover:bg-[#fffefa]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-serif text-sm italic text-[#a06f55]">{number}</span>
                  <Icon
                    className="size-4 text-[#71816d] transition-transform duration-300 group-hover:rotate-[-6deg]"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mt-8 font-serif text-2xl text-[#354238]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#747d72]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-20 border-y border-[#ddd9cd] bg-[#ecece3]/70 px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a06f55]">
              From first need to release
            </p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-0.03em] text-[#2f3d33] sm:text-5xl">
              A steady path through the work.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#68736a]">
              Follow the same six-stage lifecycle every project uses, one considered step at a time.
            </p>
          </div>
          <InteractiveWorkflowStepper />
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a06f55]">
              Take a closer look
            </p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-0.03em] text-[#2f3d33] sm:text-5xl">
              Try the real rules.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#68736a]">
              Explore the same quality checks, relationship registry, traversal limits, and
              lifecycle rules used in the product—right here, without an account.
            </p>
          </div>
          <InteractiveShowcase />
        </div>
      </section>

      <section className="border-y border-[#ddd9cd] bg-[#f0eee6] px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
          <div>
            <Lock className="size-5 text-[#71816d]" aria-hidden="true" />
            <h3 className="mt-5 font-serif text-xl text-[#354238]">A record of every change</h3>
            <p className="mt-2 text-sm leading-6 text-[#737b70]">
              Each change is written to an append-only audit log in the same transaction. Access is
              checked on the server, project by project.
            </p>
          </div>
          <div>
            <Server className="size-5 text-[#a06f55]" aria-hidden="true" />
            <h3 className="mt-5 font-serif text-xl text-[#354238]">
              Your environment, your control
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#737b70]">
              Deploy inside your own infrastructure and keep your project records in your PostgreSQL
              database.
            </p>
          </div>
          <div>
            <ShieldCheck className="size-5 text-[#71816d]" aria-hidden="true" />
            <h3 className="mt-5 font-serif text-xl text-[#354238]">Clear rules, visible answers</h3>
            <p className="mt-2 text-sm leading-6 text-[#737b70]">
              Findings come from inspectable rules applied to your records—not a language model
              making engineering judgments.
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a06f55]">
            The Morningstar Solution · 5 Man Mission
          </p>
          <h2 className="mt-6 font-serif text-4xl leading-tight tracking-[-0.04em] text-[#2f3d33] sm:text-6xl">
            Give the whole picture a place to live.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#68736a]">
            Start with a need. Follow the evidence. Keep the decisions and changes connected across
            your Product Development Life Cycle.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-[#465b4d] px-7 text-sm font-medium text-[#fffdf8] shadow-sm transition-colors hover:bg-[#34473b]"
            >
              <Link href="/sign-up">Create organization</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full border-[#c8c9bc] bg-transparent px-7 text-sm font-medium text-[#536354] transition-colors hover:bg-[#e9e7dc]"
            >
              <Link href="/docs">Read architecture docs</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
