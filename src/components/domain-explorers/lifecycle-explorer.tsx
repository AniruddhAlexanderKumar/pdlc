"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import {
  BASELINE_TRANSITIONS,
  DECISION_TRANSITIONS,
  EVIDENCE_TRANSITIONS,
  ISSUE_TRANSITIONS,
  REQUIREMENT_TRANSITIONS,
  RISK_TRANSITIONS,
} from "@/domain";
import { Select } from "@/components/ui/select";

type TransitionTable = Readonly<Record<string, readonly string[]>>;

// The real transition table objects, exactly as `RequirementService`,
// `RiskService`, and the rest read them for the actual "is this move
// legal" check performed on every transition request. Nothing here is a
// second copy kept in sync by hand — these are the same exported
// constants.
const TABLES: Record<string, TransitionTable> = {
  Requirement: REQUIREMENT_TRANSITIONS,
  Risk: RISK_TRANSITIONS,
  "Engineering Decision": DECISION_TRANSITIONS,
  Evidence: EVIDENCE_TRANSITIONS,
  Issue: ISSUE_TRANSITIONS,
  "Engineering Baseline": BASELINE_TRANSITIONS,
};

/**
 * A real lifecycle transition table, picked and browsed — proof of
 * "deterministic, and tested for it" rather than a claim of it. Every
 * arrow below is a transition the real service actually allows; every
 * absence is one it actually refuses.
 */
export function LifecycleExplorer() {
  const [artifact, setArtifact] = React.useState("Requirement");
  const table = TABLES[artifact]!;
  const statuses = Object.keys(table);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lifecycle-explorer-artifact" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose an artifact type
        </label>
        <Select
          id="lifecycle-explorer-artifact"
          className="w-full sm:w-72"
          value={artifact}
          onChange={(event) => setArtifact(event.target.value)}
        >
          {Object.keys(TABLES).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <ul className="flex flex-col gap-2">
        {statuses.map((status) => {
          const allowed = table[status] ?? [];
          return (
            <li key={status} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5 text-sm">
              <span className="font-mono font-medium text-foreground">{status}</span>
              {allowed.length === 0 ? (
                <span className="text-xs text-muted-foreground">— terminal, no further transition</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  {allowed.map((target) => (
                    <span key={target} className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <ArrowRight className="size-3" aria-hidden="true" />
                      {target}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
