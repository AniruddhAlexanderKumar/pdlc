import { progressSteps } from "@/domain/project-progress";

/**
 * How the product works, in four plain sentences.
 *
 * This dashboard previously carried two sections both titled
 * "Straightforward 3-Step Workflow", with different steps. Between them
 * they told a newcomer to "paste an Amazon ASIN / DigiKey part number",
 * "Connect Store Part", and use "1-Click Sign-Off" with "multi-custody
 * decision sign-offs". The store connection was simulated — it reported
 * "CONNECTED" without connecting to anything — and neither kind of sign-off
 * exists in the product. Three steps, two of them not real.
 *
 * These are the four stages the product actually has. The wording comes
 * from `progressSteps` — the same text the project page and each project's
 * dashboard card use to say what to do next — so the explanation here and
 * the instruction there cannot drift apart. Nothing here is a button: the
 * action belongs on a project, where there is something real to act on.
 */
const STAGES = progressSteps({
  stakeholderNeeds: 0,
  requirements: 0,
  requirementsWithoutCheck: 0,
  verificationActivities: 0,
  checksWithoutProof: 0,
  openChanges: 0,
});

export function OrientationStrip() {
  return (
    <section aria-labelledby="how-it-works-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="how-it-works-heading" className="text-base font-semibold tracking-tight text-foreground">
          How this works
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every project moves through the same four stages. Each project above shows which one it
          is on.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, index) => (
          <li key={stage.stage} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
            <span className="font-mono text-xs text-muted-foreground">Stage {index + 1}</span>
            <span className="text-sm font-medium text-foreground">{stage.title}</span>
            <p className="text-xs leading-relaxed text-muted-foreground">{stage.explanation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
