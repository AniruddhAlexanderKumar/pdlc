"use client";

import * as React from "react";
import { CheckCircle2, ChevronRight, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VerificationMethod } from "@/domain";

interface RequirementsStarterWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onRequirementGenerated?: (generated: {
    identifier: string;
    title: string;
    statement: string;
    rationale: string;
    source: string;
    priority: "HIGH" | "MEDIUM" | "CRITICAL";
    verificationMethod: VerificationMethod;
  }) => void;
}

export function RequirementsStarterWizard({ isOpen, onClose, onRequirementGenerated }: RequirementsStarterWizardProps) {
  const [step, setStep] = React.useState(1);
  const [subsystem, setSubsystem] = React.useState("Avionics & Flight Control");
  const [primaryFunction, setPrimaryFunction] = React.useState("Maintain vehicle orientation within 0.1 deg");
  const [performanceTarget, setPerformanceTarget] = React.useState("Response time < 50 ms under 5g vibration");
  const [operatingEnvironment, setOperatingEnvironment] = React.useState("Vacuum operation (-40°C to +85°C)");
  // Fixed, not chosen: the wizard offers no control for this, and a
  // useState whose setter is never called only implied otherwise.
  const safetyLevel = "CRITICAL";
  const [verificationMethod, setVerificationMethod] = React.useState<VerificationMethod>("TEST");

  function handleGenerate() {
    const identifier = `REQ-${Math.floor(100 + Math.random() * 900)}`;
    const title = `${subsystem} — ${primaryFunction.slice(0, 40)}`;
    const statement = `The ${subsystem} shall ${primaryFunction} with ${performanceTarget} during ${operatingEnvironment}.`;
    const rationale = `Required to guarantee structural margins and vehicle flight envelope stability. Derived from mission safety analysis level ${safetyLevel}.`;
    const source = `Mission Architecture Document Rev B (Safety Level: ${safetyLevel})`;

    if (onRequirementGenerated) {
      onRequirementGenerated({
        identifier,
        title,
        statement,
        rationale,
        source,
        priority: safetyLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
        verificationMethod,
      });
    }
    setStep(1);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Wand2 className="size-5" />
            <DialogTitle>Requirements Starter Wizard</DialogTitle>
          </div>
          <DialogDescription>
            Answer targeted engineering questions to generate a structured, verifiable requirement statement.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="flex flex-col gap-3 text-xs">
            <label className="font-semibold text-foreground">1. Which subsystem or component is this for?</label>
            <input
              type="text"
              value={subsystem}
              onChange={(e) => setSubsystem(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Upper Stage Propulsion, Flight Computer"
            />

            <label className="font-semibold text-foreground mt-2">2. What is its primary function or obligation?</label>
            <textarea
              value={primaryFunction}
              onChange={(e) => setPrimaryFunction(e.target.value)}
              rows={2}
              className="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Maintain payload bay temperature within 15°C to 25°C"
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3 text-xs">
            <label className="font-semibold text-foreground">3. What is the quantitative performance target & units?</label>
            <input
              type="text"
              value={performanceTarget}
              onChange={(e) => setPerformanceTarget(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Mass <= 450 kg, Response time < 50 ms"
            />

            <label className="font-semibold text-foreground mt-2">4. What operating conditions apply?</label>
            <input
              type="text"
              value={operatingEnvironment}
              onChange={(e) => setOperatingEnvironment(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Vacuum operation at 100% rated thrust (-40°C to +85°C)"
            />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3 text-xs">
            <label className="font-semibold text-foreground">5. What is the assigned Verification Method?</label>
            <select
              value={verificationMethod}
              onChange={(event) => setVerificationMethod(event.target.value as VerificationMethod)}
              className="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="TEST">TEST (Hot fire, thermal vacuum, vibration)</option>
              <option value="ANALYSIS">ANALYSIS (FEA, CFD, thermal simulation)</option>
              <option value="INSPECTION">INSPECTION (Dimensions, physical check)</option>
              <option value="DEMONSTRATION">DEMONSTRATION (Functional trial)</option>
            </select>

            <div className="rounded border border-primary/30 bg-primary/5 p-3 mt-2">
              <span className="font-semibold text-primary block mb-1">Generated Requirement Draft Preview:</span>
              <p className="font-mono text-[11px] text-foreground leading-relaxed">
                &quot;The {subsystem} shall {primaryFunction} with {performanceTarget} during {operatingEnvironment}.&quot;
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between pt-2">
          {step > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : <div />}

          {step < 3 ? (
            <Button size="sm" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleGenerate} className="gap-1.5">
              <CheckCircle2 className="size-4" /> Create Requirement
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
