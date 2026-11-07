import { PROGRESS_STAGE_DEFINITIONS } from "@/domain/project-progress";

/**
 * How the product works, as six questions a team answers in order.
 *
 * The wording comes from `PROGRESS_STAGE_DEFINITIONS` — the same text each
 * project's page and dashboard card use to say what to do next — so the
 * explanation here and the instruction there cannot drift apart. Nothing
 * here is a button: the action belongs on a project, where there is
 * something real to act on.
 *
 * (This replaced two sections both titled "Straightforward 3-Step
 * Workflow", with different steps, two of which linked to a store
 * integration that did not exist.)
 */
export function OrientationStrip() {
  return (
    <section aria-labelledby="how-it-works-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="how-it-works-heading" className="text-base font-semibold tracking-tight text-foreground">
          How this works
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every project answers the same six questions, roughly in this order. Each project above
          shows which one it&apos;s on.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {PROGRESS_STAGE_DEFINITIONS.map((stage, index) => (
          <li key={stage.stage} className="flex flex-col gap-1 bg-card p-4">
            <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
            <span className="text-sm font-medium text-foreground">
              {stage.title}
              <span className="font-normal text-muted-foreground"> — {stage.question}</span>
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">{stage.explanation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
