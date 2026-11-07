"use client";

import * as React from "react";
import { ShieldAlert, CheckCircle2, Edit3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inspectAndFormulateQuestion, type StructuredEngineeringQuestion } from "@/lib/ai/question-gatekeeper";

interface QuestionGatekeeperModalProps {
  isOpen: boolean;
  userInputQuestion: string;
  subsystemContext?: string;
  onClose: () => void;
  onAcceptFormalQuestion: (formalQuestion: string) => void;
}

export function QuestionGatekeeperModal({
  isOpen,
  userInputQuestion,
  subsystemContext = "Main Propulsion System",
  onClose,
  onAcceptFormalQuestion,
}: QuestionGatekeeperModalProps) {
  const [metricInput, setMetricInput] = React.useState("Specific Impulse (Isp)");
  const [targetInput, setTargetInput] = React.useState(">= 2.5%");
  const [conditionInput, setConditionInput] = React.useState("Vacuum Operation at 100% Thrust");
  const [constraintInput, setConstraintInput] = React.useState("Mass <= 420 kg, Chamber Temp <= 3200 K");

  const analysis: StructuredEngineeringQuestion = React.useMemo(() => {
    return inspectAndFormulateQuestion(userInputQuestion || "How do we make this engine better?", subsystemContext);
  }, [userInputQuestion, subsystemContext]);

  const compiledFormalQuestion = `How can ${subsystemContext} improve ${metricInput} by at least ${targetInput} under ${conditionInput} without exceeding ${constraintInput}?`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-500">
            <ShieldAlert className="size-5" />
            <DialogTitle>Engineering Question Definition Gatekeeper</DialogTitle>
          </div>
          <DialogDescription>
            The system detected framing ambiguity in your input question. Refine it into a measurable formal engineering question before analysis proceeds.
          </DialogDescription>
        </DialogHeader>

        {/* Input comparison */}
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex flex-col gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
            <span>Raw Input Question:</span>
            <code className="font-mono text-foreground font-normal">&quot;{userInputQuestion}&quot;</code>
          </div>

          <div className="flex flex-col gap-1 border-t border-amber-500/20 pt-2">
            <span className="font-semibold text-foreground">Detected Framing Flaws:</span>
            {analysis.flaws.map((flaw, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-muted-foreground">
                <span className="text-amber-500 font-bold">•</span>
                <span>
                  <strong className="text-foreground">{flaw.title}:</strong> {flaw.description}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Structured Refinement Controls */}
        <div className="flex flex-col gap-3 text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Edit3 className="size-3.5 text-primary" /> Define Formal Engineering Parameters:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Target Performance Metric</label>
              <input
                type="text"
                value={metricInput}
                onChange={(e) => setMetricInput(e.target.value)}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Quantitative Target & Units</label>
              <input
                type="text"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Operating Conditions</label>
              <input
                type="text"
                value={conditionInput}
                onChange={(e) => setConditionInput(e.target.value)}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Design & Safety Constraints</label>
              <input
                type="text"
                value={constraintInput}
                onChange={(e) => setConstraintInput(e.target.value)}
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="rounded border border-primary/30 bg-primary/5 p-3 mt-1">
            <span className="font-semibold text-primary block mb-1">Formal Engineering Question Preview:</span>
            <p className="font-mono text-xs text-foreground leading-relaxed">&quot;{compiledFormalQuestion}&quot;</p>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Reject & Cancel
          </Button>
          <Button size="sm" onClick={() => onAcceptFormalQuestion(compiledFormalQuestion)} className="gap-1.5">
            <CheckCircle2 className="size-4" /> Accept Formal Question & Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
